// Builds REPORT.md: a self-contained write-up with every mainnet transaction linked,
// re-verified on-chain at build time. Usage: tsx src/cli.ts share <full-run-dir> [<smoke-run-dir>]
import fs from "node:fs";
import path from "node:path";
import { ARMS, ENDPOINTS, type Arm, type Route } from "./config.js";
import { Pacer } from "./http.js";
import type { OpRecord, TxRecord } from "./ops.js";
import { summarizeArm, sol } from "./report.js";
import { Rpc, type SignatureStatus } from "./rpc.js";

const TX = "https://solscan.io/tx/";
const ACCOUNT = "https://solscan.io/account/";
const short = (s: string) => `${s.slice(0, 8)}…${s.slice(-6)}`;
const txLink = (sig: string) => `[${short(sig)}](${TX}${sig})`;
const accountLink = (a: string) => `[${short(a)}](${ACCOUNT}${a})`;
const n = (v: number) => v.toLocaleString("en-US");
const pct = (v?: number) => (v === undefined ? "–" : `${Math.round(v * 100)}%`);

const ARM_TEXT: Record<Arm, string> = {
  rpc: "Plain `sendTransaction` to the public mainnet RPC (`api.mainnet-beta.solana.com`). No tip; the RPC node rebroadcasts on its own.",
  swqos: "Helius Sender with `?swqos_only=true`: a single stake-weighted (SWQOS) path. Tip 5,000 lamports (0.000005 SOL), the tier's minimum.",
  "sender-mid": "Helius Sender with a 200,000-lamport tip (0.0002 SOL), between the two tiers: accepted, but sent best-effort through fewer paths and without the priority tip buffer.",
  "sender-max": "Helius Sender Max: tip 1,000,000 lamports (0.001 SOL), the tier's minimum. Every path plus the priority tip buffer.",
  jito: "Jito block engine, `sendTransaction?bundleOnly=true`: a single-transaction bundle with revert protection. Tip 10,000 lamports to a Jito tip account.",
  ladder:
    "Durable-nonce family. Version 1 goes to Sender SWQOS-only (tip 5,000 lamports). If it isn't seen within 4 slots, version 2 goes to Sender Max (tip 1,000,000 lamports), signed against the **same nonce**, so at most one of them can execute.",
  race: "Durable-nonce family. Three versions fired at the same moment against the **same nonce**: public RPC (no tip), Sender SWQOS-only (tip 5,000) and Jito (tip 10,000). Exactly one can land, and the winner shows which path was fastest.",
};

const ROUTE_TEXT: Record<Route, string> = {
  rpc: "public RPC",
  "sender-swqos": "Sender SWQOS-only",
  sender: "Sender",
  jito: "Jito",
};

const ROLE_TEXT: Record<TxRecord["role"], string> = {
  single: "only version",
  rung1: "v1 cheap",
  rung2: "v2 step-up",
  variant: "racer",
  cancel: "cancel",
};

const landed = (t: TxRecord) => t.state === "landed_ok" || t.state === "landed_err";

function resultText(t: TxRecord): string {
  switch (t.state) {
    case "landed_ok":
      return "landed";
    case "landed_err":
      return "landed but failed (fee paid)";
    case "superseded":
      return "never landed: another version used the nonce";
    case "rejected":
      return t.httpStatus === 429 ? "refused by the provider (HTTP 429), not forwarded" : "refused by the provider";
    case "not_landed":
      return "never landed (blockhash expired)";
    default:
      return t.state;
  }
}

function sigCell(t: TxRecord): string {
  return landed(t) ? txLink(t.signature) : `\`${t.signature}\``;
}

function loadOps(dir: string): OpRecord[] {
  return fs
    .readFileSync(path.join(dir, "ops.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as OpRecord)
    .sort((a, b) => a.round - b.round || ARMS.indexOf(a.arm) - ARMS.indexOf(b.arm));
}

const roleOrder: TxRecord["role"][] = ["single", "rung1", "rung2", "variant", "cancel"];

function txTable(ops: OpRecord[]): string {
  const rows = ["| Op | Version | Path | Tip (lamports) | Landed slot | Slots after send | Paid (lamports) | Result | Transaction |", "|---|---|---|---:|---:|---:|---:|---|---|"];
  for (const op of ops) {
    const txs = [...op.txs].sort((a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role));
    for (const t of txs) {
      const after = landed(t) && t.sentSlot !== undefined && t.confirmedSlot !== undefined ? String(t.confirmedSlot - t.sentSlot) : "–";
      rows.push(
        `| ${op.op} | ${ROLE_TEXT[t.role]} | ${ROUTE_TEXT[t.route]} | ${n(t.tipLamports)} | ${t.confirmedSlot ?? "–"} | ${after} | ${landed(t) ? n(t.costLamports) : "0"} | ${resultText(t)} | ${sigCell(t)} |`,
      );
    }
  }
  return rows.join("\n");
}

async function statusesFor(rpc: Rpc, sigs: string[]): Promise<Map<string, SignatureStatus | null>> {
  const out = new Map<string, SignatureStatus | null>();
  for (let i = 0; i < sigs.length; i += 256) {
    const batch = sigs.slice(i, i + 256);
    const st = await rpc.getSignatureStatuses(batch, true, 4);
    batch.forEach((s, j) => out.set(s, st[j]));
  }
  return out;
}

interface NonceHistory {
  account: string;
  created?: string;
  closed?: string;
  advances: number;
}

/** Creation and closing transactions of each nonce account: the ones not issued by an operation. */
async function nonceHistories(rpc: Rpc, accounts: string[], known: Set<string>): Promise<NonceHistory[]> {
  const out: NonceHistory[] = [];
  for (const account of accounts) {
    const sigs: { signature: string; slot: number; err: unknown }[] = [];
    let before: string | undefined;
    for (;;) {
      const page = await rpc.getSignaturesForAddress(account, 1000, before);
      sigs.push(...page);
      if (page.length < 1000) break;
      before = page[page.length - 1].signature;
    }
    const others = sigs.filter((s) => !known.has(s.signature) && !s.err).sort((a, b) => a.slot - b.slot);
    out.push({
      account,
      created: others[0]?.signature,
      closed: others.length > 1 ? others[others.length - 1].signature : undefined,
      advances: sigs.filter((s) => known.has(s.signature)).length,
    });
  }
  return out;
}

export async function buildShareReport(fullDir: string, smokeDir: string | undefined, templatePath: string, outPath: string): Promise<void> {
  const rpc = new Rpc(ENDPOINTS.rpc, new Pacer(150));
  const full = loadOps(fullDir);
  const smoke = smokeDir ? loadOps(smokeDir) : [];
  const meta = JSON.parse(fs.readFileSync(path.join(fullDir, "meta.json"), "utf8"));
  const allTxs = [...full, ...smoke].flatMap((o) => o.txs);
  const known = new Set(allTxs.map((t) => t.signature));

  // Re-verify every signature against the chain right now.
  const statuses = await statusesFor(rpc, allTxs.map((t) => t.signature));
  let landedOk = 0;
  let absentOk = 0;
  const mismatches: string[] = [];
  for (const t of allTxs) {
    const st = statuses.get(t.signature);
    if (landed(t)) {
      if (st && st.confirmationStatus === "finalized" && st.slot === t.confirmedSlot && Boolean(st.err) === (t.state === "landed_err")) landedOk++;
      else mismatches.push(`${t.signature}: recorded ${t.state} at slot ${t.confirmedSlot}, chain says ${JSON.stringify(st)}`);
    } else if (st) mismatches.push(`${t.signature}: recorded ${t.state}, but the chain has it at slot ${st.slot}`);
    else absentOk++;
  }
  const landedTotal = allTxs.filter(landed).length;
  const absentTotal = allTxs.length - landedTotal;

  const nonceAccounts = [...new Set(allTxs.map((t) => t.nonceAccount).filter((a): a is string => Boolean(a)))].sort();
  const nonces = await nonceHistories(rpc, nonceAccounts, known);
  const setupSigs = nonces.flatMap((h) => [h.created, h.closed].filter((s): s is string => Boolean(s)));
  const setupStatuses = await statusesFor(rpc, setupSigs);
  const setupFinal = setupSigs.filter((s) => setupStatuses.get(s)?.confirmationStatus === "finalized").length;
  const checkedAt = new Date().toISOString().replace(/\.\d+Z$/, "Z");

  // Results table
  const arms = ARMS.filter((a) => full.some((o) => o.arm === a));
  const sums = arms.map((a) => summarizeArm(a, full));
  const results = [
    "| Arm | Landed | Slots to land p50 / p90 / p99 | Landed within 4 slots | Cost per landed (SOL) |",
    "|---|---:|---|---:|---:|",
    ...sums.map(
      (s) =>
        `| \`${s.arm}\` | ${s.landedOk}/${s.accepted}${s.rejected ? ` (+${s.rejected} refused, HTTP 429)` : ""} | ${s.slotP50} / ${s.slotP90} / ${s.slotP99} | ${pct(s.within4)} | ${sol(s.costPerLandedLamports)} |`,
    ),
  ].join("\n");

  // Evidence: one landed example per arm
  const examples = [
    "| Arm | Op | Path | Slots after send | Paid (lamports) | Transaction |",
    "|---|---|---|---:|---:|---|",
    ...arms.map((a) => {
      const op = full.find((o) => o.arm === a && o.outcome === "landed_ok")!;
      const w = op.txs.find((t) => t.signature === op.winnerSignature)!;
      return `| \`${a}\` | ${op.op} | ${ROUTE_TEXT[w.route]} | ${op.slotDistance} | ${n(w.costLamports)} | ${txLink(w.signature)} |`;
    }),
  ].join("\n");

  // Evidence: every ladder step-up
  const stepUps = full.filter((o) => o.arm === "ladder" && o.escalated);
  const stepTable = [
    "| Op | v1 (cheap, 5,000-lamport tip): landed | v1 landed at | v2 (Sender Max, 1,000,000-lamport tip): dropped | v2 sent at |",
    "|---|---|---:|---|---:|",
    ...stepUps.map((o) => {
      const v1 = o.txs.find((t) => t.role === "rung1")!;
      const v2 = o.txs.find((t) => t.role === "rung2")!;
      return `| ${o.op} | ${txLink(v1.signature)} | +${(v1.confirmedSlot ?? 0) - (o.firstSentSlot ?? 0)} slots | \`${v2.signature}\` | +${(v2.sentSlot ?? 0) - (o.firstSentSlot ?? 0)} slots |`;
    }),
  ].join("\n");
  const avoided = stepUps.reduce((s, o) => s + (o.txs.find((t) => t.role === "rung2")?.worstCaseLamports ?? 0), 0);
  const alreadyLanded = stepUps.filter((o) => {
    const v1 = o.txs.find((t) => t.role === "rung1")!;
    const v2 = o.txs.find((t) => t.role === "rung2")!;
    return (v1.confirmedSlot ?? Infinity) < (v2.sentSlot ?? 0);
  }).length;

  // Evidence: one race won by each path
  const raceRows = ["| Op | Winner | Winning transaction | Dropped versions (same nonce) |", "|---|---|---|---|"];
  for (const route of ["jito", "rpc", "sender-swqos"] as Route[]) {
    const op = full.find((o) => o.arm === "race" && o.winnerRoute === route);
    if (!op) continue;
    const losers = op.txs.filter((t) => t.state === "superseded").map((t) => `${ROUTE_TEXT[t.route]}: \`${t.signature}\``);
    raceRows.push(`| ${op.op} | ${ROUTE_TEXT[route]} | ${txLink(op.winnerSignature!)} | ${losers.join("<br>")} |`);
  }
  const raceWins = summarizeArm("race", full).wins ?? {};

  const nonceTable = [
    "| Nonce account | Created | Closed (rent returned) | Operations that advanced it |",
    "|---|---|---|---:|",
    ...nonces.map((h) => `| ${accountLink(h.account)} | ${h.created ? txLink(h.created) : "–"} | ${h.closed ? txLink(h.closed) : "–"} | ${h.advances} |`),
  ].join("\n");

  const families = full.filter((o) => (o.arm === "ladder" || o.arm === "race") && o.txs.filter((t) => t.role !== "cancel").length > 1);
  const maxLanded = Math.max(...families.map((o) => o.txs.filter(landed).length));

  const verified = [
    `Checked against mainnet on ${checkedAt} with \`getSignatureStatuses\` (history search on):`,
    "",
    `- **${landedOk} of ${landedTotal}** transactions recorded as landed are finalized on-chain, in the slot and with the result recorded here.`,
    `- **${absentOk} of ${absentTotal}** signatures recorded as never landed have no record on-chain. That's the point for the nonce families: look one up, and the explorer finds nothing.`,
    `- **${setupFinal} of ${setupSigs.length}** setup and cleanup transactions (nonce accounts) are finalized.`,
    `- ${families.length} nonce families had two or three versions in flight; the most that landed in any one of them was **${maxLanded}**.`,
    ...(mismatches.length ? ["", "Mismatches:", ...mismatches.map((m) => `- ${m}`)] : []),
  ].join("\n");

  const appendixFor = (title: string, ops: OpRecord[]) => {
    const parts = [`### ${title}`, ""];
    for (const a of ARMS) {
      const armOps = ops.filter((o) => o.arm === a);
      if (!armOps.length) continue;
      const count = armOps.reduce((s, o) => s + o.txs.length, 0);
      parts.push("<details>", `<summary><code>${a}</code>: ${armOps.length} operations, ${count} transactions</summary>`, "", ARM_TEXT[a], "", txTable(armOps), "", "</details>", "");
    }
    return parts.join("\n");
  };

  const appendix = [
    appendixFor(`Full run (${meta.startedAt.slice(11, 16)}–${meta.endedAt.slice(11, 16)} UTC, ${full.length} operations)`, full),
    smoke.length ? appendixFor(`Smoke run (14:10 UTC, ${smoke.length} operations)`, smoke) : "",
  ].join("\n");

  const replacements: Record<string, string> = {
    "{{RESULTS}}": results,
    "{{RACE_WINS}}": Object.entries(raceWins)
      .sort((a, b) => b[1] - a[1])
      .map(([r, c]) => `${ROUTE_TEXT[r as Route]} ${c}`)
      .join(", "),
    "{{EXAMPLES}}": examples,
    "{{STEP_UPS}}": stepTable,
    "{{STEP_UP_COUNT}}": String(stepUps.length),
    "{{ALREADY_LANDED}}": String(alreadyLanded),
    "{{AVOIDED_SOL}}": sol(avoided),
    "{{RACES}}": raceRows.join("\n"),
    "{{NONCES}}": nonceTable,
    "{{VERIFIED}}": verified,
    "{{APPENDIX}}": appendix,
    "{{TX_TOTAL}}": n(allTxs.length + setupSigs.length),
  };
  let out = fs.readFileSync(templatePath, "utf8");
  for (const [k, v] of Object.entries(replacements)) out = out.split(k).join(v);
  fs.writeFileSync(outPath, out);
  console.log(`wrote ${outPath}: ${landedOk}/${landedTotal} landed verified, ${absentOk}/${absentTotal} absent verified, ${setupFinal}/${setupSigs.length} setup verified, ${mismatches.length} mismatches`);
}
