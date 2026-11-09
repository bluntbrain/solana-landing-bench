import { ComputeBudgetProgram, Keypair, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import { sleep } from "./http.js";
import type { Rpc } from "./rpc.js";

/**
 * For setup and cleanup only (nonce accounts, sweeps): send through the RPC with
 * preflight, rebroadcast the same bytes, and wait for confirmation or expiry.
 */
export async function sendAndConfirm(
  rpc: Rpc,
  tx: Transaction,
  signers: Keypair[],
  priority: { cuLimit: number; cuPrice: number },
  timeoutMs = 90_000,
): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await rpc.getLatestBlockhash("confirmed");
  const withBudget = new Transaction();
  withBudget.add(ComputeBudgetProgram.setComputeUnitLimit({ units: priority.cuLimit }));
  withBudget.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priority.cuPrice }));
  withBudget.add(...tx.instructions);
  withBudget.feePayer = signers[0].publicKey;
  withBudget.recentBlockhash = blockhash;
  withBudget.sign(...signers);
  const wire = withBudget.serialize().toString("base64");
  const signature = bs58.encode(withBudget.signature!);

  await rpc.call("sendTransaction", [wire, { encoding: "base64", preflightCommitment: "confirmed" }]);
  const t0 = Date.now();
  let lastResend = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const [status] = await rpc.getSignatureStatuses([signature]);
    if (status && (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized")) {
      if (status.err) throw new Error(`${signature} failed on-chain: ${JSON.stringify(status.err)}`);
      return signature;
    }
    if ((await rpc.getBlockHeight("confirmed")) > lastValidBlockHeight) break;
    if (Date.now() - lastResend > 2_000) {
      // Same signed bytes, so a resend can never execute twice.
      await rpc.call("sendTransaction", [wire, { encoding: "base64", skipPreflight: true }], 0).catch(() => undefined);
      lastResend = Date.now();
    }
    await sleep(500);
  }
  const [final] = await rpc.getSignatureStatuses([signature], true, 4);
  if (final && final.confirmationStatus !== "processed") {
    if (final.err) throw new Error(`${signature} failed on-chain: ${JSON.stringify(final.err)}`);
    return signature;
  }
  throw new Error(`${signature} did not confirm before its blockhash expired`);
}
