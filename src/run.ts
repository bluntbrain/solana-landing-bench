import fs from "node:fs";
import path from "node:path";
import { NONCE_ACCOUNT_LENGTH, PublicKey, type Keypair } from "@solana/web3.js";
import { Budget } from "./budget.js";
import {
  DEFAULT_PARAMS,
  ENDPOINTS,
  JITO_TIP_ACCOUNTS_KNOWN,
  LAMPORTS_PER_SOL,
  MAINNET_GENESIS,
  SENDER_TIP_ACCOUNTS,
  TIPS,
  type Arm,
  type RunParams,
} from "./config.js";
import { recordFunder } from "./funds.js";
import { getJson, Pacer, postJson, Semaphore, sleep } from "./http.js";
import { NoncePool } from "./nonce.js";
import { lateCheck, newOp, runOp, worstCaseForArm, type Ctx, type OpRecord } from "./ops.js";
import { renderMarkdown, sol, summaryJson, type RunMeta } from "./report.js";
import { Rpc } from "./rpc.js";
import { shuffle } from "./stats.js";
import { BlockhashCache, SlotClock, StatusTracker } from "./tracker.js";
import { buildTx, cuPriceFor, feeLamports, type Lifetime } from "./tx.js";
import { loadOrCreateWallet, NONCE_REGISTRY } from "./wallet.js";

export interface RunOptions {
  perArm: number;
  capSol: number;
  arms: Arm[];
  concurrency: number;
  poolSize: number;
  waitMinutes: number;
  outRoot: string;
  dryRun: boolean;
}

const log = (msg: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${msg}`);

async function fetchJitoTipAccounts(): Promise<PublicKey[]> {
  const r = await postJson(ENDPOINTS.jitoTipAccounts, { jsonrpc: "2.0", id: 1, method: "getTipAccounts", params: [] });
  const live: string[] = Array.isArray(r.json?.result) ? r.json.result : [];
  const usable = live.filter((a) => JITO_TIP_ACCOUNTS_KNOWN.has(a));
  if (usable.length === 0) throw new Error(`no usable Jito tip accounts (block engine said ${JSON.stringify(live)})`);
  return usable.map((a) => new PublicKey(a));
}

async function jitoTipFromFloor(): Promise<{ lamports: number; p50Lamports?: number }> {
  const r = await getJson(ENDPOINTS.jitoTipFloor);
  const p50 = r.json?.[0]?.landed_tips_50th_percentile;
  const p50Lamports = typeof p50 === "number" ? Math.round(p50 * LAMPORTS_PER_SOL) : undefined;
  return { lamports: Math.min(TIPS.jitoMax, Math.max(TIPS.jitoMin, p50Lamports ?? TIPS.jitoMin)), p50Lamports };
}

/** Simulate the heaviest transaction shapes and set one CU limit with 30% headroom. */
async function calibrateCuLimit(rpc: Rpc, payer: Keypair, runId: string, lifetimes: [string, Lifetime][]) {
  const measured: Record<string, number> = {};
  for (const [name, lifetime] of lifetimes) {
    for (const tip of [undefined, { to: SENDER_TIP_ACCOUNTS[0], lamports: TIPS.senderMax }]) {
      const built = buildTx({ payer, lifetime, cuLimit: 200_000, cuPrice: 1, memo: `lb:${runId}:99-sender-mid:r2`, tip });
      const sim = await rpc.simulate(built.wire);
      if (sim.err) throw new Error(`simulation of ${name} failed: ${JSON.stringify(sim.err)} ${sim.logs?.join(" | ")}`);
      measured[`${name}${tip ? " + tip" : ""}`] = sim.unitsConsumed ?? 0;
    }
  }
  const max = Math.max(...Object.values(measured));
  return { cuLimit: Math.max(1_000, Math.ceil((max * 1.3) / 100) * 100), measured };
}

function opLine(op: OpRecord): string {
  const how = op.winnerRole ? `${op.winnerRole} via ${op.winnerRoute}` : "";
  const dist = op.slotDistance !== undefined ? ` +${op.slotDistance} slots` : "";
  return `${op.op.padEnd(15)} ${op.outcome.padEnd(10)} ${how}${dist} cost ${op.costLamports}${op.anomaly ? ` ⚠ ${op.anomaly}` : ""}`;
}

export async function run(opts: RunOptions): Promise<string | undefined> {
  const payer = loadOrCreateWallet();
  const me = payer.publicKey.toBase58();
  const rpc = new Rpc(ENDPOINTS.rpc, new Pacer(125));
  const genesis = await rpc.getGenesisHash();
  if (genesis !== MAINNET_GENESIS) throw new Error(`RPC is not mainnet (genesis ${genesis})`);
  const runId = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
  log(`run ${runId}: wallet ${me}, RPC ${ENDPOINTS.rpc}`);

  const needsNonce = opts.arms.includes("ladder") || opts.arms.includes("race");
  const rent = await rpc.getMinimumBalanceForRentExemption(NONCE_ACCOUNT_LENGTH);
  const setupLamports = (needsNonce ? opts.poolSize * (rent + 50_000) : 0) + 100_000;
  let balance = await rpc.getBalance(me);

  const jitoTipAccounts = await fetchJitoTipAccounts();
  const jito = await jitoTipFromFloor();
  const ping = await getJson(ENDPOINTS.senderPing);
  log(`Jito tip floor p50 ${jito.p50Lamports ?? "?"} lamports → using ${jito.lamports}; Sender ping HTTP ${ping.status}`);

  if (opts.dryRun) {
    const cuLimit = 2_000;
    const params: RunParams = { ...DEFAULT_PARAMS, cuLimit, cuPrice: cuPriceFor(DEFAULT_PARAMS.targetPriorityLamports, cuLimit), jitoTipLamports: jito.lamports };
    const bh = await rpc.getLatestBlockhash();
    const built = buildTx({ payer, lifetime: { kind: "blockhash", ...bh }, cuLimit, cuPrice: params.cuPrice, memo: "lb:dry-run" });
    const quoted = await rpc.getFeeForMessage(built.message);
    log(`fee check: cluster quotes ${quoted} lamports, formula says ${feeLamports(params.cuPrice, cuLimit)}`);
    const perOp = opts.arms.map((a) => [a, worstCaseForArm(params, a)] as const);
    for (const [a, w] of perOp) log(`  ${a.padEnd(11)} worst case ${w} lamports per op`);
    const total = perOp.reduce((s, [, w]) => s + w * opts.perArm, 0);
    log(`worst case for ${opts.perArm} per arm: ${sol(total)} SOL (cap ${opts.capSol} SOL); balance ${sol(balance)} SOL`);
    return undefined;
  }

  const waitUntil = Date.now() + opts.waitMinutes * 60_000;
  while (balance < setupLamports + 2_000_000) {
    if (Date.now() > waitUntil) throw new Error(`wallet holds ${sol(balance)} SOL; need at least ${sol(setupLamports + 2_000_000)}`);
    log(`waiting for funds: ${sol(balance)} SOL in ${me}`);
    await sleep(15_000);
    balance = await rpc.getBalance(me);
  }
  const funder = await recordFunder(rpc, me);
  log(`balance ${sol(balance)} SOL${funder ? `, funded by ${funder}` : ""}`);
  const capLamports = Math.min(Math.round(opts.capSol * LAMPORTS_PER_SOL), balance - setupLamports);

  const clock = new SlotClock(rpc);
  await clock.start();
  const tracker = new StatusTracker(rpc);
  tracker.start();
  const blockhashes = new BlockhashCache(rpc);
  await blockhashes.start();
  const stopLoops = () => {
    clock.stop();
    tracker.stop();
    blockhashes.stop();
  };

  try {
    const pool = new NoncePool(rpc, payer, clock, NONCE_REGISTRY);
    if (needsNonce) {
      const { createdLamports } = await pool.ensure(opts.poolSize, { cuLimit: 5_000, cuPrice: cuPriceFor(10_000, 5_000) });
      log(`nonce pool ready: ${pool.slots.length} accounts (${sol(createdLamports)} SOL of refundable rent added)`);
    }

    const lifetimes: [string, Lifetime][] = [["blockhash memo", { kind: "blockhash", ...blockhashes.get() }]];
    if (needsNonce) lifetimes.push(["nonce memo", { kind: "nonce", nonceAccount: pool.slots[0].pubkey, nonceValue: pool.slots[0].value }]);
    const { cuLimit, measured } = await calibrateCuLimit(rpc, payer, runId, lifetimes);
    const params: RunParams = {
      ...DEFAULT_PARAMS,
      cuLimit,
      cuPrice: cuPriceFor(DEFAULT_PARAMS.targetPriorityLamports, cuLimit),
      jitoTipLamports: jito.lamports,
    };
    const probe = buildTx({ payer, lifetime: { kind: "blockhash", ...blockhashes.get() }, cuLimit, cuPrice: params.cuPrice, memo: "lb:fee-check" });
    const quoted = await rpc.getFeeForMessage(probe.message);
    const expected = feeLamports(params.cuPrice, cuLimit);
    if (quoted !== expected) throw new Error(`fee formula disagrees with the cluster: ${expected} vs ${quoted}`);
    log(`CU used ${JSON.stringify(measured)} → limit ${cuLimit}, price ${params.cuPrice} µL/CU, fee ${expected} lamports (cluster agrees)`);

    const outDir = path.join(opts.outRoot, runId);
    fs.mkdirSync(outDir, { recursive: true });
    const opsFile = path.join(outDir, "ops.jsonl");
    const budget = new Budget(capLamports);
    const ctx: Ctx = {
      payer,
      rpc,
      clock,
      tracker,
      blockhashes,
      pool,
      budget,
      params,
      runId,
      pacers: { sender: new Pacer(1_100), jito: new Pacer(1_100) },
      jitoTipAccounts,
    };

    const startedAt = new Date().toISOString();
    const startBalance = await rpc.getBalance(me);
    const sem = new Semaphore(opts.concurrency);
    const inflight: Promise<void>[] = [];
    const done: OpRecord[] = [];
    const notes: string[] = [];
    log(`starting: ${opts.perArm} rounds × [${opts.arms.join(", ")}], cap ${sol(capLamports)} SOL`);
    outer: for (let round = 0; round < opts.perArm; round++) {
      for (const arm of shuffle(opts.arms)) {
        await sem.acquire();
        const op = newOp(params, arm, round);
        if (!budget.canStart(op.worstCaseLamports)) {
          sem.release();
          notes.push(`Stopped starting new operations in round ${round}: the spend cap was reached.`);
          break outer;
        }
        budget.reserve(op.op, op.worstCaseLamports);
        inflight.push(
          runOp(ctx, op)
            .then((r) => {
              done.push(r);
              fs.appendFileSync(opsFile, JSON.stringify(r) + "\n");
              log(opLine(r));
            })
            .finally(() => sem.release()),
        );
      }
      if (round % 10 === 9) log(`round ${round + 1}/${opts.perArm}: ${done.length} ops done, committed ${sol(budget.committed())} SOL`);
    }
    await Promise.all(inflight);

    const surprises = await lateCheck(ctx, done);
    if (surprises) notes.push(`${surprises} transaction(s) first marked rejected or unknown turned out to have landed.`);
    await sleep(3_000);
    const endBalance = await rpc.getBalance(me);
    const feeChecks = await verifyFees(rpc, done);
    const endedAt = new Date().toISOString();

    done.sort((a, b) => a.round - b.round || a.arm.localeCompare(b.arm));
    fs.writeFileSync(opsFile, done.map((o) => JSON.stringify(o)).join("\n") + "\n");
    const meta: RunMeta = {
      runId,
      startedAt,
      endedAt,
      rpc: ENDPOINTS.rpc,
      params: { ...params, tips: TIPS, jitoTipFloorP50Lamports: jito.p50Lamports, cuMeasured: measured, concurrency: opts.concurrency, noncePool: opts.poolSize },
      perArm: opts.perArm,
      capLamports,
      startBalance,
      endBalance,
      feeChecks,
      notes,
    };
    fs.writeFileSync(path.join(outDir, "meta.json"), JSON.stringify(meta, null, 2));
    fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summaryJson(done), null, 2));
    fs.writeFileSync(path.join(outDir, "summary.md"), renderMarkdown(meta, done));
    log(`done: ${done.length} ops, recorded cost ${sol(done.reduce((s, o) => s + o.costLamports, 0))} SOL, balance change ${sol(startBalance - endBalance)} SOL`);
    log(`results in ${outDir}`);
    return outDir;
  } finally {
    stopLoops();
  }
}

/** Pull a few landed transactions per arm from the chain and compare fee and payer debit with our numbers. */
async function verifyFees(rpc: Rpc, ops: OpRecord[]): Promise<string[]> {
  const sample = new Map<string, OpRecord["txs"][number][]>();
  for (const op of ops) {
    for (const t of op.txs) {
      if (t.state !== "landed_ok") continue;
      const key = `${op.arm}/${t.role}`;
      const list = sample.get(key) ?? [];
      if (list.length < 2) sample.set(key, [...list, t]);
    }
  }
  let matched = 0;
  let checked = 0;
  const problems: string[] = [];
  for (const [key, txs] of sample) {
    for (const t of txs) {
      const tx = await rpc.getTransaction(t.signature).catch(() => null);
      if (!tx?.meta) continue;
      checked++;
      const expectedFee = feeLamports(t.cuPrice, t.cuLimit);
      const paid = tx.meta.preBalances[0] - tx.meta.postBalances[0];
      if (tx.meta.fee === expectedFee && paid === t.costLamports) matched++;
      else problems.push(`${key} ${t.signature}: fee ${tx.meta.fee} (expected ${expectedFee}), payer debited ${paid} (expected ${t.costLamports})`);
    }
  }
  return [`On-chain spot check: ${matched}/${checked} landed transactions matched the expected fee and payer debit.`, ...problems];
}
