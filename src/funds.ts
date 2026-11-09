import fs from "node:fs";
import path from "node:path";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { ENDPOINTS, MAINNET_GENESIS } from "./config.js";
import { sendAndConfirm } from "./chain.js";
import { Pacer } from "./http.js";
import { sol } from "./report.js";
import { Rpc } from "./rpc.js";
import { cuPriceFor, feeLamports } from "./tx.js";
import { KEYS_DIR, loadOrCreateWallet, NONCE_REGISTRY } from "./wallet.js";

const FUNDER_FILE = path.join(KEYS_DIR, "funder.json");
const log = (msg: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${msg}`);

/** Whoever paid the fee on transfers into the bench wallet. Errors if there's more than one. */
export async function findFunder(rpc: Rpc, me: string): Promise<string> {
  const funders = new Map<string, number>();
  let before: string | undefined;
  for (;;) {
    const page = await rpc.getSignaturesForAddress(me, 1000, before);
    for (const s of page) {
      if (s.err) continue;
      const tx = await rpc.getTransaction(s.signature);
      if (!tx?.meta) continue;
      const keys: string[] = [
        ...tx.transaction.message.accountKeys,
        ...(tx.meta.loadedAddresses?.writable ?? []),
        ...(tx.meta.loadedAddresses?.readonly ?? []),
      ];
      if (keys[0] === me) continue; // our own transactions
      const i = keys.indexOf(me);
      const delta = i >= 0 ? tx.meta.postBalances[i] - tx.meta.preBalances[i] : 0;
      if (delta > 0) funders.set(keys[0], (funders.get(keys[0]) ?? 0) + delta);
    }
    if (page.length < 1000) break;
    before = page[page.length - 1].signature;
  }
  if (funders.size === 0) throw new Error("couldn't find a transfer into the bench wallet; pass --to");
  if (funders.size > 1) throw new Error(`more than one funder (${[...funders.keys()].join(", ")}); pass --to`);
  return [...funders.keys()][0];
}

/** Remember the funder while the wallet history is still short. */
export async function recordFunder(rpc: Rpc, me: string): Promise<string | undefined> {
  if (fs.existsSync(FUNDER_FILE)) return JSON.parse(fs.readFileSync(FUNDER_FILE, "utf8")).funder;
  try {
    const funder = await findFunder(rpc, me);
    fs.writeFileSync(FUNDER_FILE, JSON.stringify({ funder }, null, 2));
    return funder;
  } catch (e) {
    log(`couldn't record the funder yet: ${(e as Error).message}`);
    return undefined;
  }
}

/** Close every nonce account the runs created, then send everything left to the funder (or --to). */
export async function sweep(opts: { to?: string; yes: boolean }): Promise<void> {
  const payer = loadOrCreateWallet();
  const me = payer.publicKey.toBase58();
  const rpc = new Rpc(ENDPOINTS.rpc, new Pacer(150));
  if ((await rpc.getGenesisHash()) !== MAINNET_GENESIS) throw new Error("RPC is not mainnet");
  const priority = { cuLimit: 5_000, cuPrice: cuPriceFor(10_000, 5_000) };

  const registry: string[] = fs.existsSync(NONCE_REGISTRY) ? JSON.parse(fs.readFileSync(NONCE_REGISTRY, "utf8")) : [];
  for (const addr of registry) {
    const info = await rpc.getAccountInfo(addr);
    if (!info) continue;
    if (!opts.yes) {
      log(`would close nonce account ${addr} and recover ${sol(info.lamports)} SOL`);
      continue;
    }
    const tx = new Transaction().add(
      SystemProgram.nonceWithdraw({
        noncePubkey: new PublicKey(addr),
        authorizedPubkey: payer.publicKey,
        toPubkey: payer.publicKey,
        lamports: info.lamports,
      }),
    );
    const sig = await sendAndConfirm(rpc, tx, [payer], priority);
    log(`closed nonce account ${addr}, recovered ${sol(info.lamports)} SOL (${sig})`);
  }

  const savedFunder = fs.existsSync(FUNDER_FILE) ? JSON.parse(fs.readFileSync(FUNDER_FILE, "utf8")).funder : undefined;
  const dest = opts.to ?? savedFunder ?? (await findFunder(rpc, me));
  new PublicKey(dest); // throws on a malformed address
  const balance = await rpc.getBalance(me);
  // The fee payer must end at exactly zero (anything between zero and rent-exempt is rejected),
  // so the fee has to be exact: check our formula against the cluster before sending.
  const fee = feeLamports(priority.cuPrice, priority.cuLimit);
  const probe = new Transaction().add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: new PublicKey(dest), lamports: 1 }));
  const quoted = await quoteFee(rpc, probe, payer.publicKey, priority);
  if (quoted !== fee) throw new Error(`fee mismatch: formula ${fee}, cluster ${quoted}`);
  const amount = balance - fee;
  if (amount <= 0) {
    log(`nothing to sweep (balance ${sol(balance)} SOL)`);
    return;
  }
  if (!opts.yes) {
    log(`would send ${sol(amount)} SOL to ${dest} (fee ${fee} lamports). Re-run with --yes to do it.`);
    return;
  }
  const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: new PublicKey(dest), lamports: amount }));
  const sig = await sendAndConfirm(rpc, tx, [payer], priority);
  log(`sent ${sol(amount)} SOL to ${dest} (${sig}); bench wallet now holds ${sol(await rpc.getBalance(me))} SOL`);
}

async function quoteFee(rpc: Rpc, tx: Transaction, feePayer: PublicKey, priority: { cuLimit: number; cuPrice: number }) {
  const { ComputeBudgetProgram } = await import("@solana/web3.js");
  const t = new Transaction()
    .add(ComputeBudgetProgram.setComputeUnitLimit({ units: priority.cuLimit }))
    .add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priority.cuPrice }))
    .add(...tx.instructions);
  t.feePayer = feePayer;
  t.recentBlockhash = (await rpc.getLatestBlockhash("confirmed")).blockhash;
  return rpc.getFeeForMessage(t.serializeMessage().toString("base64"));
}
