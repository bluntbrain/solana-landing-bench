import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { BASE_FEE_PER_SIGNATURE, MAX_TIP_LAMPORTS, MEMO_PROGRAM_ID } from "./config.js";

export type Lifetime =
  | { kind: "blockhash"; blockhash: string; lastValidBlockHeight: number }
  | { kind: "nonce"; nonceAccount: PublicKey; nonceValue: string };

export interface BuildArgs {
  payer: Keypair;
  lifetime: Lifetime;
  cuLimit: number;
  cuPrice: number; // micro-lamports per compute unit
  memo?: string;
  tip?: { to: PublicKey; lamports: number };
  /** Extra instructions (used by tests to force an on-chain failure). */
  extra?: TransactionInstruction[];
}

export interface BuiltTx {
  signature: string;
  wire: string; // base64, ready for sendTransaction
  message: string; // base64 message, for getFeeForMessage
}

/**
 * One memo transaction. With a nonce lifetime, AdvanceNonceAccount goes first and the
 * nonce value replaces the recent blockhash, which is what makes every version signed
 * against the same nonce value mutually exclusive.
 */
export function buildTx(a: BuildArgs): BuiltTx {
  if (a.tip && (a.tip.lamports <= 0 || a.tip.lamports > MAX_TIP_LAMPORTS)) {
    throw new Error(`refusing to sign a tip of ${a.tip.lamports} lamports`);
  }
  const tx = new Transaction();
  tx.feePayer = a.payer.publicKey;
  if (a.lifetime.kind === "nonce") {
    tx.add(SystemProgram.nonceAdvance({ noncePubkey: a.lifetime.nonceAccount, authorizedPubkey: a.payer.publicKey }));
    tx.recentBlockhash = a.lifetime.nonceValue;
  } else {
    tx.recentBlockhash = a.lifetime.blockhash;
  }
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: a.cuLimit }));
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: a.cuPrice }));
  if (a.memo) tx.add(new TransactionInstruction({ programId: MEMO_PROGRAM_ID, keys: [], data: Buffer.from(a.memo, "utf8") }));
  if (a.tip) tx.add(SystemProgram.transfer({ fromPubkey: a.payer.publicKey, toPubkey: a.tip.to, lamports: a.tip.lamports }));
  for (const ix of a.extra ?? []) tx.add(ix);
  tx.sign(a.payer);
  return {
    signature: bs58.encode(tx.signature!),
    wire: tx.serialize().toString("base64"),
    message: tx.serializeMessage().toString("base64"),
  };
}

/** Priority fee the runtime charges: ceil(cuPrice * cuLimit / 1e6). It's charged on the limit, not on usage. */
export function priorityFeeLamports(cuPrice: number, cuLimit: number): number {
  return Number((BigInt(cuPrice) * BigInt(cuLimit) + 999_999n) / 1_000_000n);
}

/** Smallest CU price that reaches the target priority fee at this limit. */
export function cuPriceFor(targetPriorityLamports: number, cuLimit: number): number {
  return Math.ceil((targetPriorityLamports * 1_000_000) / cuLimit);
}

export function feeLamports(cuPrice: number, cuLimit: number, signatures = 1): number {
  return BASE_FEE_PER_SIGNATURE * signatures + priorityFeeLamports(cuPrice, cuLimit);
}

/** What one transaction costs the payer. A transaction that lands but fails pays the fee, not the tip. */
export function txCostLamports(o: { cuPrice: number; cuLimit: number; tipLamports: number; succeeded: boolean }): number {
  return feeLamports(o.cuPrice, o.cuLimit) + (o.succeeded ? o.tipLamports : 0);
}
