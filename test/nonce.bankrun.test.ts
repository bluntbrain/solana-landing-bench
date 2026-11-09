// Runs the real Solana runtime locally (solana-bankrun) to check the claim the whole
// benchmark rests on: versions signed against one durable nonce are mutually exclusive.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair, NONCE_ACCOUNT_LENGTH, NonceAccount, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { start, type BanksClient, type ProgramTestContext } from "solana-bankrun";
import { buildTx, txCostLamports, type BuiltTx, type Lifetime } from "../src/tx.js";

const cuLimit = 20_000;
const cuPrice = 500_000; // 10,000 lamports of priority fee
const cost = (tip: number, succeeded = true) => BigInt(txCostLamports({ cuPrice, cuLimit, tipLamports: tip, succeeded }));
const toTx = (b: BuiltTx) => Transaction.from(Buffer.from(b.wire, "base64"));

async function readNonce(client: BanksClient, nonce: PublicKey): Promise<string> {
  const account = await client.getAccount(nonce);
  assert.ok(account, "nonce account exists");
  return NonceAccount.fromAccountData(Buffer.from(account.data)).nonce;
}

async function nextSlot(ctx: ProgramTestContext): Promise<void> {
  ctx.warpToSlot((await ctx.banksClient.getSlot()) + 2n);
}

/** A funded, rent-exempt account to receive tips (small tips to a brand-new account would fail the rent check). */
async function tipAccount(ctx: ProgramTestContext): Promise<PublicKey> {
  const to = Keypair.generate().publicKey;
  const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: ctx.payer.publicKey, toPubkey: to, lamports: 1_000_000_000 }));
  tx.recentBlockhash = (await ctx.banksClient.getLatestBlockhash())![0];
  tx.feePayer = ctx.payer.publicKey;
  tx.sign(ctx.payer);
  await ctx.banksClient.processTransaction(tx);
  return to;
}

async function freshNonce(ctx: ProgramTestContext): Promise<Extract<Lifetime, { kind: "nonce" }>> {
  const { banksClient: client, payer } = ctx;
  const nonceKp = Keypair.generate();
  const rent = await client.getRent();
  const tx = SystemProgram.createNonceAccount({
    fromPubkey: payer.publicKey,
    noncePubkey: nonceKp.publicKey,
    authorizedPubkey: payer.publicKey,
    lamports: Number(rent.minimumBalance(BigInt(NONCE_ACCOUNT_LENGTH))),
  });
  tx.recentBlockhash = (await client.getLatestBlockhash())![0];
  tx.feePayer = payer.publicKey;
  tx.sign(payer, nonceKp);
  await client.processTransaction(tx);
  await nextSlot(ctx); // a nonce can't advance in the slot it was set
  return { kind: "nonce", nonceAccount: nonceKp.publicKey, nonceValue: await readNonce(client, nonceKp.publicKey) };
}

async function setup() {
  const ctx = await start([], []);
  const tipTo = await tipAccount(ctx);
  const balance = () => ctx.banksClient.getBalance(ctx.payer.publicKey);
  return { ctx, client: ctx.banksClient, payer: ctx.payer, tipTo, balance };
}

test("the trap: without a nonce, a re-signed version with a bigger tip is a second transaction, and both execute", async () => {
  const { ctx, client, payer, tipTo, balance } = await setup();
  const [blockhash, lastValid] = (await client.getLatestBlockhash())!;
  const lifetime: Lifetime = { kind: "blockhash", blockhash, lastValidBlockHeight: Number(lastValid) };
  const cheap = buildTx({ payer, lifetime, cuLimit, cuPrice, memo: "order-42", tip: { to: tipTo, lamports: 5_000 } });
  const dear = buildTx({ payer, lifetime, cuLimit, cuPrice, memo: "order-42", tip: { to: tipTo, lamports: 1_000_000 } });
  assert.notEqual(cheap.signature, dear.signature);

  const before = await balance();
  assert.equal((await client.tryProcessTransaction(toTx(cheap))).result, null);
  assert.equal((await client.tryProcessTransaction(toTx(dear))).result, null);
  assert.equal(before - (await balance()), cost(5_000) + cost(1_000_000), "paid for both");
  void ctx;
});

test("one nonce: the first version executes, the second is rejected and pays nothing", async () => {
  const { ctx, client, payer, tipTo, balance } = await setup();
  const lifetime = await freshNonce(ctx);
  const cheap = buildTx({ payer, lifetime, cuLimit, cuPrice, memo: "order-42:r1", tip: { to: tipTo, lamports: 5_000 } });
  const dear = buildTx({ payer, lifetime, cuLimit, cuPrice, memo: "order-42:r2", tip: { to: tipTo, lamports: 1_000_000 } });

  const b0 = await balance();
  const first = await client.tryProcessTransaction(toTx(cheap));
  assert.equal(first.result, null);
  console.log(`  CU used by a nonce + memo + tip transaction: ${first.meta?.computeUnitsConsumed}`);
  const b1 = await balance();
  assert.equal(b0 - b1, cost(5_000));

  const second = await client.tryProcessTransaction(toTx(dear));
  assert.ok(second.result, "second version must be rejected");
  console.log(`  second version rejected with: ${second.result}`);
  assert.equal(await balance(), b1, "the rejected version costs nothing");
  assert.notEqual(await readNonce(client, lifetime.nonceAccount), lifetime.nonceValue, "the nonce moved on");
});

test("one nonce, other order: the dear version lands first and the cheap one is rejected", async () => {
  const { ctx, client, payer, tipTo, balance } = await setup();
  const lifetime = await freshNonce(ctx);
  const cheap = buildTx({ payer, lifetime, cuLimit, cuPrice, memo: "order-7:r1", tip: { to: tipTo, lamports: 5_000 } });
  const dear = buildTx({ payer, lifetime, cuLimit, cuPrice, memo: "order-7:r2", tip: { to: tipTo, lamports: 1_000_000 } });

  const b0 = await balance();
  assert.equal((await client.tryProcessTransaction(toTx(dear))).result, null);
  assert.ok((await client.tryProcessTransaction(toTx(cheap))).result);
  assert.equal(b0 - (await balance()), cost(1_000_000));
});

test("a version that fails on-chain still uses up the nonce: fee paid, tip not, and nothing else can run", async () => {
  const { ctx, client, payer, tipTo, balance } = await setup();
  const lifetime = await freshNonce(ctx);
  const impossible = SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: tipTo, lamports: 10n ** 18n });
  const failing = buildTx({ payer, lifetime, cuLimit, cuPrice, memo: "order-9:r1", tip: { to: tipTo, lamports: 5_000 }, extra: [impossible] });
  const other = buildTx({ payer, lifetime, cuLimit, cuPrice, memo: "order-9:r2", tip: { to: tipTo, lamports: 1_000_000 } });

  const b0 = await balance();
  const r1 = await client.tryProcessTransaction(toTx(failing));
  assert.ok(r1.result, "the impossible transfer makes it fail");
  console.log(`  failing version: ${r1.result}`);
  const b1 = await balance();
  assert.equal(b0 - b1, cost(5_000, false), "fee charged, tip rolled back");
  assert.notEqual(await readNonce(client, lifetime.nonceAccount), lifetime.nonceValue, "nonce advanced despite the failure");

  assert.ok((await client.tryProcessTransaction(toTx(other))).result, "the other version is now invalid");
  assert.equal(await balance(), b1);
});

test("a cancel (advance-only, same nonce) makes every pending version invalid", async () => {
  const { ctx, client, payer, tipTo, balance } = await setup();
  const lifetime = await freshNonce(ctx);
  const cheap = buildTx({ payer, lifetime, cuLimit, cuPrice, memo: "order-3:r1", tip: { to: tipTo, lamports: 5_000 } });
  const dear = buildTx({ payer, lifetime, cuLimit, cuPrice, memo: "order-3:r2", tip: { to: tipTo, lamports: 1_000_000 } });
  const cancel = buildTx({ payer, lifetime, cuLimit, cuPrice, memo: "order-3:cancel" });

  const b0 = await balance();
  assert.equal((await client.tryProcessTransaction(toTx(cancel))).result, null);
  const b1 = await balance();
  assert.equal(b0 - b1, cost(0), "the cancel costs one fee");
  assert.ok((await client.tryProcessTransaction(toTx(cheap))).result);
  assert.ok((await client.tryProcessTransaction(toTx(dear))).result);
  assert.equal(await balance(), b1, "cancelled versions cost nothing");
});
