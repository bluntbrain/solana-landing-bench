import { ARMS, LAMPORTS_PER_SOL, type Arm } from "./config.js";
import type { OpRecord } from "./ops.js";
import { quantile, share } from "./stats.js";

export interface ArmSummary {
  arm: Arm;
  ops: number;
  rejected: number; // every send for the op was refused by the provider
  rateLimited: number; // ...and at least one refusal was HTTP 429
  accepted: number;
  landedOk: number;
  landedErr: number;
  notLanded: number;
  cancelled: number;
  unknown: number;
  landedRate?: number; // landedOk / accepted
  slotP50?: number;
  slotP90?: number;
  slotP99?: number;
  within1?: number;
  within2?: number;
  within4?: number;
  msP50?: number;
  ackMsP50?: number;
  totalCostLamports: number;
  costPerLandedLamports?: number;
  stepUpRate?: number; // ladder: share of accepted ops that sent the Sender Max version
  wins?: Record<string, number>; // ladder: by role, race: by route
  anomalies: number;
}

const isRejected = (op: OpRecord) => {
  const sends = op.txs.filter((t) => t.role !== "cancel");
  const refused = (t: (typeof sends)[number]) =>
    t.sendError !== undefined && t.httpStatus !== undefined && (t.httpStatus === 429 || (t.httpStatus >= 200 && t.httpStatus < 500));
  return sends.length > 0 && sends.every(refused) && op.outcome !== "landed_ok" && op.outcome !== "landed_err";
};

export function summarizeArm(arm: Arm, all: OpRecord[]): ArmSummary {
  const ops = all.filter((o) => o.arm === arm);
  const rejectedOps = ops.filter(isRejected);
  const accepted = ops.filter((o) => !isRejected(o));
  const ok = ops.filter((o) => o.outcome === "landed_ok");
  const slots = ok.map((o) => o.slotDistance).filter((v): v is number => v !== undefined);
  const ms = ok.map((o) => o.msToConfirmed).filter((v): v is number => v !== undefined);
  const acks = ops.flatMap((o) => o.txs.filter((t) => t.role !== "cancel" && t.ackMs !== undefined).map((t) => t.ackMs!));
  const totalCostLamports = ops.reduce((sum, o) => sum + o.costLamports, 0);
  const count = (outcome: OpRecord["outcome"]) => accepted.filter((o) => o.outcome === outcome).length;

  const s: ArmSummary = {
    arm,
    ops: ops.length,
    rejected: rejectedOps.length,
    rateLimited: rejectedOps.filter((o) => o.txs.some((t) => t.httpStatus === 429)).length,
    accepted: accepted.length,
    landedOk: ok.length,
    landedErr: ops.filter((o) => o.outcome === "landed_err").length,
    notLanded: count("not_landed"),
    cancelled: count("cancelled"),
    unknown: count("unknown"),
    landedRate: accepted.length ? ok.length / accepted.length : undefined,
    slotP50: quantile(slots, 0.5),
    slotP90: quantile(slots, 0.9),
    slotP99: quantile(slots, 0.99),
    within1: share(slots, (v) => v <= 1),
    within2: share(slots, (v) => v <= 2),
    within4: share(slots, (v) => v <= 4),
    msP50: quantile(ms, 0.5),
    ackMsP50: quantile(acks, 0.5),
    totalCostLamports,
    costPerLandedLamports: ok.length ? totalCostLamports / ok.length : undefined,
    anomalies: ops.filter((o) => o.anomaly).length,
  };
  if (arm === "ladder") {
    s.stepUpRate = accepted.length ? accepted.filter((o) => o.escalated).length / accepted.length : undefined;
    s.wins = tally(ok.map((o) => o.winnerRole ?? "?"));
  }
  if (arm === "race") s.wins = tally(ok.map((o) => o.winnerRoute ?? "?"));
  return s;
}

function tally(keys: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of keys) out[k] = (out[k] ?? 0) + 1;
  return out;
}

export interface Verdict {
  criterion: string;
  pass: boolean | undefined;
  detail: string;
}

/** The decision rule from PLAN.md: ladder vs Sender Max. */
export function decide(byArm: Map<Arm, ArmSummary>): Verdict[] {
  const l = byArm.get("ladder");
  const m = byArm.get("sender-max");
  if (!l || !m) return [{ criterion: "ladder vs sender-max", pass: undefined, detail: "both arms are needed" }];
  const pct = (v?: number) => (v === undefined ? "n/a" : `${(v * 100).toFixed(1)}%`);
  const v: Verdict[] = [];
  v.push({
    criterion: "Landed rate within 2 points of Sender Max",
    pass: l.landedRate !== undefined && m.landedRate !== undefined ? l.landedRate >= m.landedRate - 0.02 : undefined,
    detail: `ladder ${pct(l.landedRate)} vs sender-max ${pct(m.landedRate)}`,
  });
  v.push({
    criterion: "p90 slot distance at most 2 slots worse",
    pass: l.slotP90 !== undefined && m.slotP90 !== undefined ? l.slotP90 <= m.slotP90 + 2 : undefined,
    detail: `ladder ${l.slotP90 ?? "n/a"} vs sender-max ${m.slotP90 ?? "n/a"} slots`,
  });
  v.push({
    criterion: "Cost per landed at most half of Sender Max",
    pass:
      l.costPerLandedLamports !== undefined && m.costPerLandedLamports !== undefined
        ? l.costPerLandedLamports <= m.costPerLandedLamports / 2
        : undefined,
    detail: `ladder ${sol(l.costPerLandedLamports)} vs sender-max ${sol(m.costPerLandedLamports)} SOL`,
  });
  return v;
}

export const sol = (lamports?: number, digits = 6) =>
  lamports === undefined ? "n/a" : (lamports / LAMPORTS_PER_SOL).toFixed(digits);

const pct = (v?: number) => (v === undefined ? "–" : `${Math.round(v * 100)}%`);
const num = (v?: number) => (v === undefined ? "–" : String(v));

export interface RunMeta {
  runId: string;
  startedAt: string;
  endedAt: string;
  rpc: string;
  params: Record<string, unknown>;
  perArm: number;
  capLamports: number;
  startBalance: number;
  endBalance: number;
  feeChecks: string[];
  notes: string[];
}

export function renderMarkdown(meta: RunMeta, ops: OpRecord[]): string {
  const arms = ARMS.filter((a) => ops.some((o) => o.arm === a));
  const byArm = new Map(arms.map((a) => [a, summarizeArm(a, ops)] as const));
  const recorded = ops.reduce((sum, o) => sum + o.costLamports, 0);
  const onChain = meta.startBalance - meta.endBalance;
  const lines: string[] = [];
  lines.push(`# Run ${meta.runId}`, "");
  lines.push(`${meta.startedAt} → ${meta.endedAt} · RPC ${meta.rpc} · ${meta.perArm} ops per arm requested`, "");
  lines.push("| Arm | Ops | Landed OK | Landed rate | Refused (429) | Slots p50 / p90 / p99 | ≤1 / ≤2 / ≤4 slots | Cost per landed (SOL) | Total (SOL) |");
  lines.push("|---|---:|---:|---:|---:|---|---|---:|---:|");
  for (const s of byArm.values()) {
    lines.push(
      `| \`${s.arm}\` | ${s.ops} | ${s.landedOk} | ${pct(s.landedRate)} | ${s.rejected} (${s.rateLimited}) | ${num(s.slotP50)} / ${num(s.slotP90)} / ${num(s.slotP99)} | ${pct(s.within1)} / ${pct(s.within2)} / ${pct(s.within4)} | ${sol(s.costPerLandedLamports)} | ${sol(s.totalCostLamports)} |`,
    );
  }
  lines.push("");
  const ladder = byArm.get("ladder");
  if (ladder) {
    lines.push(`**Ladder:** stepped up to Sender Max on ${pct(ladder.stepUpRate)} of operations. Wins by step: ${JSON.stringify(ladder.wins ?? {})}.`, "");
  }
  const race = byArm.get("race");
  if (race) lines.push(`**Race:** wins by path: ${JSON.stringify(race.wins ?? {})}.`, "");
  const other = [...byArm.values()].map((s) => `${s.arm}: ${s.notLanded} not landed, ${s.cancelled} cancelled, ${s.unknown} unknown, ${s.landedErr} landed-but-failed`);
  lines.push("**Other outcomes:** " + other.join("; ") + ".", "");

  lines.push("## Decision rule", "");
  for (const v of decide(byArm)) lines.push(`- ${v.pass === undefined ? "⚪" : v.pass ? "✅" : "❌"} ${v.criterion}: ${v.detail}`);
  lines.push("");

  lines.push("## Money", "");
  lines.push(`- Recorded cost of all operations: ${sol(recorded)} SOL`);
  lines.push(`- Wallet balance change over the same window: ${sol(onChain)} SOL (${onChain === recorded ? "matches" : `differs by ${onChain - recorded} lamports`})`);
  lines.push(`- Spend cap: ${sol(meta.capLamports)} SOL`);
  for (const c of meta.feeChecks) lines.push(`- ${c}`);
  lines.push("");

  const anomalies = ops.filter((o) => o.anomaly);
  lines.push("## Anomalies", "");
  if (anomalies.length === 0) lines.push("None. No nonce family landed more than one version.");
  for (const o of anomalies) lines.push(`- \`${o.op}\`: ${o.anomaly}`);
  lines.push("");

  lines.push("## Settings", "", "```json", JSON.stringify(meta.params, null, 2), "```", "");
  if (meta.notes.length) lines.push("## Notes", "", ...meta.notes.map((n) => `- ${n}`), "");
  lines.push("Slot distance = landed slot minus our latest view of the processed slot when the request went out.");
  lines.push("Cost per landed = everything the arm paid (fees and tips of every transaction that landed) divided by operations that landed OK.");
  return lines.join("\n");
}

export function summaryJson(ops: OpRecord[]) {
  return ARMS.filter((a) => ops.some((o) => o.arm === a)).map((a) => summarizeArm(a, ops));
}
