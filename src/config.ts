import { PublicKey } from "@solana/web3.js";

export const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
export const LAMPORTS_PER_SOL = 1_000_000_000;
export const BASE_FEE_PER_SIGNATURE = 5_000;

export const ENDPOINTS = {
  rpc: process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com",
  sender: "https://sender.helius-rpc.com/fast",
  senderSwqos: "https://sender.helius-rpc.com/fast?swqos_only=true",
  senderPing: "https://sender.helius-rpc.com/ping",
  jitoTx: "https://mainnet.block-engine.jito.wtf/api/v1/transactions?bundleOnly=true",
  jitoTipAccounts: "https://mainnet.block-engine.jito.wtf/api/v1/getTipAccounts",
  jitoTipFloor: "https://bundles.jito.wtf/api/v1/bundles/tip_floor",
};

// Designated Sender tip accounts (mainnet-beta), copied from
// https://www.helius.dev/docs/sending-transactions/sender on 2026-11-09.
export const SENDER_TIP_ACCOUNTS = [
  "4ACfpUFoaSD9bfPdeu6DBt89gB6ENTeHBXCAi87NhDEE",
  "D2L6yPZ2FmmmTKPgzaMKdhu6EWZcTpLy1Vhx8uvZe7NZ",
  "9bnz4RShgq1hAnLnZbP8kbgBg1kEmcJBYQq3gQbmnSta",
  "5VY91ws6B2hMmBFRsXkoAAdsPHBJwRfBht4DXox3xkwn",
  "2nyhqdwKcJZR2vcqCyrYsaPVdAnFoJjiksCXJ7hfEYgD",
  "2q5pghRs6arqVjRvT5gfgWfWcHWmw1ZuCzphgd5KfWGJ",
  "wyvPkWjVZz1M8fHQnMMCDTQDbkManefNNhweYk5WkcF",
  "3KCKozbAaF75qEU33jtzozcJ29yJuaLJTy2jFdzUY8bT",
  "4vieeGHPYPG2MmyPRcYjdiDmmhN3ww7hsFNap8pVN3Ey",
  "4TQLFNWK8AovT1gFvda5jfw2oJeRMKEmw7aH6MGBJ3or",
].map((a) => new PublicKey(a));

// Jito tip accounts. The run fetches the live list from the block engine and
// only uses addresses that are also on this list.
export const JITO_TIP_ACCOUNTS_KNOWN = new Set([
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
  "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
  "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
  "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
  "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
  "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
]);

export const TIPS = {
  swqos: 5_000, // 0.000005 SOL: Sender SWQOS-only minimum
  senderMid: 200_000, // 0.0002 SOL: between tiers (best effort, fewer paths, no buffer)
  senderMax: 1_000_000, // 0.001 SOL: Sender Max minimum (every path + priority tip buffer)
  jitoMin: 10_000,
  jitoMax: 100_000,
};

// Never sign a tip above this, whatever the config says.
export const MAX_TIP_LAMPORTS = 2_000_000;

export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export const ARMS = ["rpc", "swqos", "sender-mid", "sender-max", "jito", "ladder", "race"] as const;
export type Arm = (typeof ARMS)[number];
export type SingleArm = Exclude<Arm, "ladder" | "race">;

export type Route = "rpc" | "sender-swqos" | "sender" | "jito";

export interface RunParams {
  /** Same compute-unit limit for every transaction, so priority per CU is identical across arms. */
  cuLimit: number;
  /** Micro-lamports per CU, derived so that cuLimit * cuPrice ~= targetPriorityLamports. */
  cuPrice: number;
  targetPriorityLamports: number;
  /** Ladder: send the Sender Max version if the cheap one isn't seen after this many slots. */
  escalateAfterSlots: number;
  /** Nonce families: cancel if nothing is confirmed by then. */
  cancelAfterMs: number;
  /** Nonce families: give up (state unknown) this long after the cancel. */
  giveUpAfterMs: number;
  /** Blockhash transactions: blocks past lastValidBlockHeight before the final history check. */
  expiryMarginBlocks: number;
  jitoTipLamports: number;
}

export const DEFAULT_PARAMS: Omit<RunParams, "cuLimit" | "cuPrice" | "jitoTipLamports"> = {
  targetPriorityLamports: 10_000,
  escalateAfterSlots: 4,
  cancelAfterMs: 30_000,
  giveUpAfterMs: 60_000,
  expiryMarginBlocks: 5,
};
