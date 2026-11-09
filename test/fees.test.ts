import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { buildTx, cuPriceFor, feeLamports, priorityFeeLamports, txCostLamports } from "../src/tx.js";

test("priority fee is ceil(price * limit / 1e6), charged on the limit", () => {
  assert.equal(priorityFeeLamports(0, 200_000), 0);
  assert.equal(priorityFeeLamports(1, 1), 1);
  assert.equal(priorityFeeLamports(333_333, 3), 1);
  assert.equal(priorityFeeLamports(500_000, 20_000), 10_000);
  assert.equal(priorityFeeLamports(500_001, 20_000), 10_001);
});

test("cuPriceFor gives the smallest price that reaches the target", () => {
  for (const limit of [777, 1_000, 1_300, 2_100, 20_000]) {
    const price = cuPriceFor(10_000, limit);
    assert.ok(priorityFeeLamports(price, limit) >= 10_000, `limit ${limit}`);
    assert.ok(priorityFeeLamports(price - 1, limit) <= 10_000, `limit ${limit}`);
  }
});

test("a transaction that lands but fails pays the fee, not the tip", () => {
  assert.equal(feeLamports(500_000, 20_000), 15_000);
  assert.equal(txCostLamports({ cuPrice: 500_000, cuLimit: 20_000, tipLamports: 1_000_000, succeeded: true }), 1_015_000);
  assert.equal(txCostLamports({ cuPrice: 500_000, cuLimit: 20_000, tipLamports: 1_000_000, succeeded: false }), 15_000);
});

const payer = Keypair.generate();
const nonceAccount = Keypair.generate().publicKey;
const tipTo = Keypair.generate().publicKey;
const nonceLifetime = { kind: "nonce" as const, nonceAccount, nonceValue: "11111111111111111111111111111111" };

test("refuses to sign an oversized tip", () => {
  assert.throws(() => buildTx({ payer, lifetime: nonceLifetime, cuLimit: 1_000, cuPrice: 1, tip: { to: tipTo, lamports: 2_000_001 } }));
  assert.throws(() => buildTx({ payer, lifetime: nonceLifetime, cuLimit: 1_000, cuPrice: 1, tip: { to: tipTo, lamports: 0 } }));
});

test("nonce transactions put AdvanceNonceAccount first and use the nonce value as the blockhash", () => {
  const built = buildTx({ payer, lifetime: nonceLifetime, cuLimit: 1_000, cuPrice: 1, memo: "x", tip: { to: tipTo, lamports: 5_000 } });
  const tx = Transaction.from(Buffer.from(built.wire, "base64"));
  assert.equal(tx.recentBlockhash, nonceLifetime.nonceValue);
  const first = tx.instructions[0];
  assert.ok(first.programId.equals(SystemProgram.programId));
  assert.equal(first.data.readUInt32LE(0), 4, "SystemInstruction::AdvanceNonceAccount");
  assert.ok(first.keys[0].pubkey.equals(nonceAccount));
  assert.equal(tx.instructions.length, 5); // advance, CU limit, CU price, memo, tip
});

test("versions of one operation get different signatures", () => {
  const a = buildTx({ payer, lifetime: nonceLifetime, cuLimit: 1_000, cuPrice: 1, memo: "op:r1", tip: { to: tipTo, lamports: 5_000 } });
  const b = buildTx({ payer, lifetime: nonceLifetime, cuLimit: 1_000, cuPrice: 1, memo: "op:r2", tip: { to: tipTo, lamports: 1_000_000 } });
  assert.notEqual(a.signature, b.signature);
  assert.ok(new PublicKey(tipTo).equals(tipTo));
});
