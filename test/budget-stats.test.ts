import assert from "node:assert/strict";
import { test } from "node:test";
import { Budget } from "../src/budget.js";
import { quantile, share, shuffle } from "../src/stats.js";

test("budget books the worst case, settles to the actual cost, and stops at the cap", () => {
  const b = new Budget(1_000_000);
  assert.ok(b.canStart(600_000));
  b.reserve("a", 600_000);
  assert.ok(!b.canStart(500_000));
  b.settle("a", 15_000);
  assert.equal(b.committed(), 15_000);
  assert.ok(b.canStart(985_000));
  assert.ok(!b.canStart(985_001));
  b.reserve("b", 100);
  b.reserve("b", 50); // never lowers a booking
  assert.equal(b.committed(), 15_100);
  b.reserve("b", 400); // raising is fine
  assert.equal(b.committed(), 15_400);
});

test("nearest-rank quantiles return observed values", () => {
  assert.equal(quantile([], 0.5), undefined);
  assert.equal(quantile([7], 0.99), 7);
  assert.equal(quantile([5, 1, 3, 2, 4], 0.5), 3);
  assert.equal(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 9);
  assert.equal(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.99), 10);
  assert.equal(share([1, 2, 3, 4], (v) => v <= 2), 0.5);
});

test("shuffle is a permutation", () => {
  const items = ["a", "b", "c", "d", "e", "f", "g"];
  const out = shuffle(items);
  assert.deepEqual([...out].sort(), [...items].sort());
  assert.deepEqual(items, ["a", "b", "c", "d", "e", "f", "g"], "input untouched");
});
