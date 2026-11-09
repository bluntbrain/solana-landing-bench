import assert from "node:assert/strict";
import { test } from "node:test";
import type { Arm } from "../src/config.js";
import type { OpRecord, TxRecord } from "../src/ops.js";
import { decide, summarizeArm } from "../src/report.js";

let n = 0;
function tx(over: Partial<TxRecord> = {}): TxRecord {
  return {
    role: "single",
    route: "sender-swqos",
    signature: `sig${n++}`,
    tipLamports: 5_000,
    cuLimit: 1_000,
    cuPrice: 10_000_000,
    worstCaseLamports: 20_000,
    httpStatus: 200,
    ackMs: 50,
    state: "landed_ok",
    costLamports: 20_000,
    ...over,
  };
}

function op(arm: Arm, outcome: OpRecord["outcome"], over: Partial<OpRecord> = {}, txs: TxRecord[] = [tx()]): OpRecord {
  return { op: `${n++}-${arm}`, arm, round: 0, outcome, costLamports: 0, worstCaseLamports: 20_000, txs, ...over };
}

test("arm summary: 429 refusals are counted apart, cost per landed covers everything paid", () => {
  const ops = [
    op("swqos", "landed_ok", { slotDistance: 1, costLamports: 20_000 }),
    op("swqos", "landed_ok", { slotDistance: 2, costLamports: 20_000 }),
    op("swqos", "landed_ok", { slotDistance: 5, costLamports: 20_000 }),
    op("swqos", "rejected", {}, [tx({ httpStatus: 429, sendError: "rate limited", state: "rejected", costLamports: 0 })]),
    op("swqos", "landed_err", { costLamports: 15_000 }, [tx({ state: "landed_err", costLamports: 15_000 })]),
  ];
  const s = summarizeArm("swqos", ops);
  assert.equal(s.ops, 5);
  assert.equal(s.rejected, 1);
  assert.equal(s.rateLimited, 1);
  assert.equal(s.accepted, 4);
  assert.equal(s.landedOk, 3);
  assert.equal(s.landedErr, 1);
  assert.equal(s.landedRate, 3 / 4);
  assert.equal(s.slotP50, 2);
  assert.equal(s.slotP90, 5);
  assert.equal(s.within1, 1 / 3);
  assert.equal(s.totalCostLamports, 75_000);
  assert.equal(s.costPerLandedLamports, 25_000);
});

test("decision rule: passes when the ladder keeps up for under half the cost", () => {
  const max = Array.from({ length: 10 }, (_, i) => op("sender-max", "landed_ok", { slotDistance: 1 + (i % 2), costLamports: 1_015_000 }));
  const ladder = Array.from({ length: 10 }, (_, i) =>
    op("ladder", "landed_ok", { slotDistance: 2 + (i % 2), costLamports: i === 0 ? 1_015_000 : 20_000, escalated: i === 0, winnerRole: i === 0 ? "rung2" : "rung1" }),
  );
  const byArm = new Map<Arm, ReturnType<typeof summarizeArm>>([
    ["sender-max", summarizeArm("sender-max", max)],
    ["ladder", summarizeArm("ladder", ladder)],
  ]);
  const verdicts = decide(byArm);
  assert.deepEqual(verdicts.map((v) => v.pass), [true, true, true]);
  assert.deepEqual(byArm.get("ladder")!.wins, { rung2: 1, rung1: 9 });
  assert.equal(byArm.get("ladder")!.stepUpRate, 0.1);
});

test("decision rule: fails when the ladder lands less often", () => {
  const max = Array.from({ length: 10 }, () => op("sender-max", "landed_ok", { slotDistance: 1, costLamports: 1_015_000 }));
  const ladder = [
    ...Array.from({ length: 8 }, () => op("ladder", "landed_ok", { slotDistance: 1, costLamports: 20_000 })),
    op("ladder", "cancelled", { costLamports: 15_000 }),
    op("ladder", "cancelled", { costLamports: 15_000 }),
  ];
  const verdicts = decide(new Map([["sender-max", summarizeArm("sender-max", max)], ["ladder", summarizeArm("ladder", ladder)]]));
  assert.equal(verdicts[0].pass, false);
});
