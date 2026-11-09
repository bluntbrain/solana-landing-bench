import fs from "node:fs";
import path from "node:path";
import { Keypair } from "@solana/web3.js";

export const KEYS_DIR = path.resolve(process.env.BENCH_KEYS_DIR ?? "keys");
export const WALLET_FILE = path.join(KEYS_DIR, "bench-wallet.json");
export const NONCE_REGISTRY = path.join(KEYS_DIR, "nonce-accounts.json");

export function loadOrCreateWallet(): Keypair {
  if (!fs.existsSync(WALLET_FILE)) {
    fs.mkdirSync(KEYS_DIR, { recursive: true, mode: 0o700 });
    const kp = Keypair.generate();
    fs.writeFileSync(WALLET_FILE, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
    return kp;
  }
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(WALLET_FILE, "utf8"))));
}
