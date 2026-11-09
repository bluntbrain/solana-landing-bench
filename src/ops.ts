import type { Keypair, PublicKey } from "@solana/web3.js";
import type { Budget } from "./budget.js";
import { ENDPOINTS, SENDER_TIP_ACCOUNTS, TIPS, type Arm, type Route, type RunParams, type SingleArm } from "./config.js";
import { Pacer, postJson, sleep } from "./http.js";
import type { NoncePool, NonceSlot } from "./nonce.js";
import type { Rpc } from "./rpc.js";
import type { BlockhashCache, Seen, SlotClock, StatusTracker } from "./tracker.js";
import { buildTx, feeLamports, txCostLamports, type Lifetime } from "./tx.js";

export type Role = "single" | "rung1" | "rung2" | "variant" | "cancel";
export type TxState = "pending" | "landed_ok" | "landed_err" | "not_landed" | "superseded" | "rejected" | "unknown";
export type OpOutcome = "landed_ok" | "landed_err" | "not_landed" | "cancelled" | "rejected" | "unknown";

export interface TxRecord {
  role: Role;
  route: Route;
  signature: string;
  tipLamports: number;
  tipAccount?: string;
  cuLimit: number;
  cuPrice: number;
  worstCaseLamports: number;
  nonceAccount?: string;
  lastValidBlockHeight?: number;
  sentAtMs?: number;
  sentSlot?: number;
  ackMs?: number;
  httpStatus?: number;
  sendError?: string;
  processedSlot?: number;
  processedAtMs?: number;
  confirmedSlot?: number;
  confirmedAtMs?: number;
  err?: unknown;
  state: TxState;
  costLamports: number;
}

export interface OpRecord {
  op: string;
  arm: Arm;
  round: number;
  startedAtMs?: number;
  firstSentSlot?: number;
  outcome: OpOutcome;
  winnerRole?: Role;
  winnerRoute?: Route;
  winnerSignature?: string;
  landedSlot?: number;
  slotDistance?: number;
  msToConfirmed?: number;
  costLamports: number;
  worstCaseLamports: number;
  escalated?: boolean;
  anomaly?: string;
  settled?: boolean;
  txs: TxRecord[];
}

export interface Ctx {
  payer: Keypair;
  rpc: Rpc;
  clock: SlotClock;
  tracker: StatusTracker;
  blockhashes: BlockhashCache;
  pool: NoncePool;
  budget: Budget;
  params: RunParams;
  runId: string;
  pacers: { sender: Pacer; jito: Pacer };
  jitoTipAccounts: PublicKey[];
}

const pick = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)];
const senderTip = (lamports: number) => ({ to: pick(SENDER_TIP_ACCOUNTS), lamports });
const jitoTip = (ctx: Ctx) => ({ to: pick(ctx.jitoTipAccounts), lamports: ctx.params.jitoTipLamports });

function pacerFor(ctx: Ctx, route: Route): Pacer {
  if (route === "rpc") return ctx.rpc.pacer;
  if (route === "jito") return ctx.pacers.jito;
  return ctx.pacers.sender;
}

/** Worst case for one operation. A nonce family pays for at most one version, so it's the dearest version. */
export function worstCaseForArm(params: RunParams, arm: Arm): number {
  const fee = feeLamports(params.cuPrice, params.cuLimit);
  switch (arm) {
    case "rpc":
      return fee;
    case "swqos":
      return fee + TIPS.swqos;
    case "sender-mid":
      return fee + TIPS.senderMid;
    case "sender-max":
    case "ladder":
      return fee + TIPS.senderMax;
    case "jito":
      return fee + params.jitoTipLamports;
    case "race":
      return fee + Math.max(TIPS.swqos, params.jitoTipLamports);
  }
}

function newTx(
  ctx: Ctx,
  opId: string,
  role: Role,
  route: Route,
  lifetime: Lifetime,
  tag: string,
  tip?: { to: PublicKey; lamports: number },
): { rec: TxRecord; wire: string } {
  const { cuLimit, cuPrice } = ctx.params;
  const built = buildTx({ payer: ctx.payer, lifetime, cuLimit, cuPrice, memo: `lb:${ctx.runId}:${opId}:${tag}`, tip });
  const rec: TxRecord = {
    role,
    route,
    signature: built.signature,
    tipLamports: tip?.lamports ?? 0,
    tipAccount: tip?.to.toBase58(),
    cuLimit,
    cuPrice,
    worstCaseLamports: txCostLamports({ cuPrice, cuLimit, tipLamports: tip?.lamports ?? 0, succeeded: true }),
    state: "pending",
    costLamports: 0,
  };
  if (lifetime.kind === "nonce") rec.nonceAccount = lifetime.nonceAccount.toBase58();
  else rec.lastValidBlockHeight = lifetime.lastValidBlockHeight;
  return { rec, wire: built.wire };
}

async function post(route: Route, wire: string) {
  const url =
    route === "rpc"
      ? ENDPOINTS.rpc
      : route === "sender"
        ? ENDPOINTS.sender
        : route === "sender-swqos"
          ? ENDPOINTS.senderSwqos
          : ENDPOINTS.jitoTx;
  const options =
    route === "jito"
      ? { encoding: "base64" }
      : route === "rpc"
        ? { encoding: "base64", skipPreflight: true } // the RPC node rebroadcasts on its own
        : { encoding: "base64", skipPreflight: true, maxRetries: 0 };
  return postJson(url, { jsonrpc: "2.0", id: 1, method: "sendTransaction", params: [wire, options] }, 8_000);
}

/** Send once. The signature is watched before the request goes out, so a fast landing is never missed. */
async function send(ctx: Ctx, rec: TxRecord, wire: string): Promise<void> {
  ctx.tracker.watch(rec.signature);
  pacerFor(ctx, rec.route).touch();
  rec.sentAtMs = Date.now();
  rec.sentSlot = ctx.clock.slot;
  const r = await post(rec.route, wire);
  rec.ackMs = Math.round(r.ms);
  rec.httpStatus = r.status;
  if (r.status === 200 && typeof r.json?.result === "string") {
    if (r.json.result !== rec.signature) rec.sendError = `provider returned another signature: ${r.json.result}`;
    return;
  }
  rec.sendError = r.json?.error
    ? `${r.json.error.code}: ${r.json.error.message}`
    : (r.error ?? `HTTP ${r.status}: ${r.text.slice(0, 160)}`);
  if (r.status === 429) pacerFor(ctx, rec.route).backoff(2_000);
}

/** The provider answered and said no (rate limit or a JSON-RPC error). Timeouts and 5xx stay uncertain. */
export function explicitlyRejected(rec: TxRecord): boolean {
  if (rec.sendError === undefined || rec.httpStatus === undefined) return false;
  return rec.httpStatus === 429 || (rec.httpStatus >= 200 && rec.httpStatus < 500);
}

function applySeen(rec: TxRecord, seen: Seen | undefined): void {
  if (!seen) return;
  rec.processedSlot = seen.processedSlot;
  rec.processedAtMs = seen.processedAtMs;
  if (seen.confirmedSlot === undefined) return;
  rec.confirmedSlot = seen.confirmedSlot;
  rec.confirmedAtMs = seen.confirmedAtMs;
  rec.err = seen.err;
  rec.state = seen.err ? "landed_err" : "landed_ok";
  rec.costLamports = txCostLamports({
    cuPrice: rec.cuPrice,
    cuLimit: rec.cuLimit,
    tipLamports: rec.tipLamports,
    succeeded: !seen.err,
  });
}

const landed = (rec: TxRecord) => rec.state === "landed_ok" || rec.state === "landed_err";

function finishOp(ctx: Ctx, op: OpRecord, winner: TxRecord | undefined): void {
  if (winner && landed(winner)) {
    op.outcome = winner.role === "cancel" ? "cancelled" : (winner.state as OpOutcome);
    op.winnerRole = winner.role;
    op.winnerRoute = winner.route;
    op.winnerSignature = winner.signature;
    op.landedSlot = winner.confirmedSlot;
    if (winner.role !== "cancel") {
      if (op.firstSentSlot !== undefined && winner.confirmedSlot !== undefined) {
        op.slotDistance = winner.confirmedSlot - op.firstSentSlot;
      }
      if (op.startedAtMs !== undefined && winner.confirmedAtMs !== undefined) {
        op.msToConfirmed = winner.confirmedAtMs - op.startedAtMs;
      }
    }
  }
  op.costLamports = op.txs.reduce((sum, t) => sum + t.costLamports, 0);
  settleBudget(ctx, op);
}

function settleBudget(ctx: Ctx, op: OpRecord): void {
  if (op.settled) return;
  op.settled = true;
  // Unknown means a version could still land later, so keep the worst case booked.
  ctx.budget.settle(op.op, op.outcome === "unknown" ? op.worstCaseLamports : op.costLamports);
}

async function runSingle(ctx: Ctx, arm: SingleArm, op: OpRecord): Promise<void> {
  const spec: Record<SingleArm, { route: Route; tip?: () => { to: PublicKey; lamports: number } }> = {
    rpc: { route: "rpc" },
    swqos: { route: "sender-swqos", tip: () => senderTip(TIPS.swqos) },
    "sender-mid": { route: "sender", tip: () => senderTip(TIPS.senderMid) },
    "sender-max": { route: "sender", tip: () => senderTip(TIPS.senderMax) },
    jito: { route: "jito", tip: () => jitoTip(ctx) },
  };
  const { route, tip } = spec[arm];
  await pacerFor(ctx, route).acquire();
  const bh = ctx.blockhashes.get();
  const { rec, wire } = newTx(ctx, op.op, "single", route, { kind: "blockhash", ...bh }, "s", tip?.());
  op.txs.push(rec);
  await send(ctx, rec, wire);
  op.startedAtMs = rec.sentAtMs;
  op.firstSentSlot = rec.sentSlot;

  const seen = ctx.tracker.watch(rec.signature);
  let checked = true;
  if (!explicitlyRejected(rec)) {
    const expired = () => ctx.clock.blockHeight > bh.lastValidBlockHeight + ctx.params.expiryMarginBlocks;
    // Wall-clock guard in case block-height polling stalls; a blockhash lives roughly 60-90 s.
    const guard = (rec.sentAtMs ?? Date.now()) + 180_000;
    while (seen.confirmedSlot === undefined && !expired() && Date.now() < guard) await sleep(200);
    if (seen.confirmedSlot === undefined) {
      // Only final once the blockhash has provably expired: one history search, then call it.
      await ctx.tracker.finalCheck([rec.signature]).catch(() => {
        checked = false;
      });
      if (!expired()) checked = false;
    }
  }
  applySeen(rec, seen);
  if (rec.state === "pending") rec.state = explicitlyRejected(rec) ? "rejected" : checked ? "not_landed" : "unknown";
  ctx.tracker.unwatch(rec.signature);
  // A lone transaction ends in exactly one of these states, all of which are valid outcomes.
  op.outcome = rec.state as OpOutcome;
  finishOp(ctx, op, rec);
}

function familySeen(ctx: Ctx, op: OpRecord): boolean {
  return op.txs.some((t) => {
    const s = ctx.tracker.watch(t.signature);
    return s.processedSlot !== undefined || s.confirmedSlot !== undefined;
  });
}

async function waitForConfirmedMember(ctx: Ctx, op: OpRecord, deadline: number): Promise<TxRecord | undefined> {
  for (;;) {
    const hit = op.txs.find((t) => ctx.tracker.watch(t.signature).confirmedSlot !== undefined);
    if (hit || Date.now() >= deadline) return hit;
    await sleep(100);
  }
}

/**
 * Settle a nonce family. If nothing is confirmed by the cancel deadline, send advance-only
 * versions with the same nonce: once one lands, no other version can. Durable nonce
 * transactions never expire, so without a landed cancel the honest answer is "unknown".
 */
async function resolveFamily(
  ctx: Ctx,
  op: OpRecord,
  slot: NonceSlot,
  lifetime: Extract<Lifetime, { kind: "nonce" }>,
  t0: number,
): Promise<void> {
  let winner = await waitForConfirmedMember(ctx, op, t0 + ctx.params.cancelAfterMs);
  if (!winner) {
    await ctx.rpc.pacer.acquire(1);
    const c1 = newTx(ctx, op.op, "cancel", "rpc", lifetime, "c1");
    op.txs.push(c1.rec);
    await send(ctx, c1.rec, c1.wire);
    await ctx.pacers.sender.acquire(1);
    const c2 = newTx(ctx, op.op, "cancel", "sender-swqos", lifetime, "c2", senderTip(TIPS.swqos));
    op.txs.push(c2.rec);
    await send(ctx, c2.rec, c2.wire);
    winner = await waitForConfirmedMember(ctx, op, Date.now() + ctx.params.giveUpAfterMs);
  }

  // One history search over every version: settles states and would expose two landings.
  await ctx.tracker.finalCheck(op.txs.map((t) => t.signature)).catch(() => undefined);
  for (const t of op.txs) applySeen(t, ctx.tracker.watch(t.signature));
  const landedVersions = op.txs.filter(landed).sort((a, b) => (a.confirmedSlot ?? 0) - (b.confirmedSlot ?? 0));
  if (landedVersions.length > 1) {
    op.anomaly = `${landedVersions.length} versions of one nonce family landed: ${landedVersions.map((t) => t.signature).join(", ")}`;
  }
  winner = landedVersions[0];
  for (const t of op.txs) {
    if (t.state === "pending") t.state = winner ? "superseded" : explicitlyRejected(t) ? "rejected" : "unknown";
    ctx.tracker.unwatch(t.signature);
  }
  if (!winner) op.outcome = "unknown";
  finishOp(ctx, op, winner);
  await ctx.pool.release(slot, lifetime.nonceValue, Boolean(winner));
}

async function runLadder(ctx: Ctx, op: OpRecord): Promise<void> {
  const slot = await ctx.pool.acquire();
  const lifetime = { kind: "nonce" as const, nonceAccount: slot.pubkey, nonceValue: slot.value };
  try {
    await ctx.pacers.sender.acquire();
    const r1 = newTx(ctx, op.op, "rung1", "sender-swqos", lifetime, "r1", senderTip(TIPS.swqos));
    op.txs.push(r1.rec);
    await send(ctx, r1.rec, r1.wire);
    op.startedAtMs = r1.rec.sentAtMs;
    op.firstSentSlot = r1.rec.sentSlot;
    const t0 = Date.now();
    let stepped = false;
    while (!familySeen(ctx, op) && Date.now() - t0 < ctx.params.cancelAfterMs) {
      const due = explicitlyRejected(r1.rec) || ctx.clock.slot >= (op.firstSentSlot ?? 0) + ctx.params.escalateAfterSlots;
      if (!stepped && due) {
        stepped = true;
        await ctx.pacers.sender.acquire(1);
        if (!familySeen(ctx, op)) {
          const r2 = newTx(ctx, op.op, "rung2", "sender", lifetime, "r2", senderTip(TIPS.senderMax));
          op.txs.push(r2.rec);
          await send(ctx, r2.rec, r2.wire);
          op.escalated = true;
        }
      }
      await sleep(50);
    }
    await resolveFamily(ctx, op, slot, lifetime, t0);
  } catch (e) {
    await ctx.pool.release(slot, lifetime.nonceValue, false);
    throw e;
  }
}

async function runRace(ctx: Ctx, op: OpRecord): Promise<void> {
  const slot = await ctx.pool.acquire();
  const lifetime = { kind: "nonce" as const, nonceAccount: slot.pubkey, nonceValue: slot.value };
  try {
    // Wait for every path's rate-limit slot first, so all three go out at the same moment.
    await Promise.all([ctx.rpc.pacer.acquire(), ctx.pacers.sender.acquire(), ctx.pacers.jito.acquire()]);
    const versions = [
      newTx(ctx, op.op, "variant", "rpc", lifetime, "vr"),
      newTx(ctx, op.op, "variant", "sender-swqos", lifetime, "vs", senderTip(TIPS.swqos)),
      newTx(ctx, op.op, "variant", "jito", lifetime, "vj", jitoTip(ctx)),
    ];
    versions.forEach((v) => op.txs.push(v.rec));
    await Promise.all(versions.map((v) => send(ctx, v.rec, v.wire)));
    op.startedAtMs = Math.min(...versions.map((v) => v.rec.sentAtMs ?? Infinity));
    op.firstSentSlot = Math.min(...versions.map((v) => v.rec.sentSlot ?? Infinity));
    await resolveFamily(ctx, op, slot, lifetime, Date.now());
  } catch (e) {
    await ctx.pool.release(slot, lifetime.nonceValue, false);
    throw e;
  }
}

export function newOp(params: RunParams, arm: Arm, round: number): OpRecord {
  return {
    op: `${round}-${arm}`,
    arm,
    round,
    outcome: "unknown",
    costLamports: 0,
    worstCaseLamports: worstCaseForArm(params, arm),
    txs: [],
  };
}

/** The caller must have booked op.worstCaseLamports in the budget before calling this. */
export async function runOp(ctx: Ctx, op: OpRecord): Promise<OpRecord> {
  try {
    if (op.arm === "ladder") await runLadder(ctx, op);
    else if (op.arm === "race") await runRace(ctx, op);
    else await runSingle(ctx, op.arm, op);
  } catch (e) {
    op.outcome = "unknown";
    op.anomaly = `error: ${(e as Error).message}`;
    for (const t of op.txs) if (t.state === "pending") t.state = "unknown";
    settleBudget(ctx, op);
  }
  return op;
}

/** After the run: anything a provider rejected gets one history search, in case it landed anyway. */
export async function lateCheck(ctx: Ctx, ops: OpRecord[]): Promise<number> {
  const suspects = ops.flatMap((op) => op.txs.filter((t) => t.state === "rejected" || t.state === "unknown").map((t) => ({ op, t })));
  if (suspects.length === 0) return 0;
  await ctx.tracker.finalCheck(suspects.map((s) => s.t.signature));
  let surprises = 0;
  for (const { op, t } of suspects) {
    const seen = ctx.tracker.watch(t.signature);
    if (seen.confirmedSlot === undefined) continue;
    surprises++;
    applySeen(t, seen);
    op.anomaly = `${op.anomaly ? op.anomaly + "; " : ""}${t.signature} was marked ${t.sendError ? "rejected" : "unknown"} but landed`;
    if (op.outcome === "rejected" || op.outcome === "unknown") {
      op.outcome = t.role === "cancel" ? "cancelled" : (t.state as OpOutcome);
      op.winnerRole = t.role;
      op.winnerRoute = t.route;
      op.winnerSignature = t.signature;
      op.landedSlot = t.confirmedSlot;
    }
    op.costLamports = op.txs.reduce((sum, x) => sum + x.costLamports, 0);
  }
  return surprises;
}
