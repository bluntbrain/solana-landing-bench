import { Pacer, postJson, sleep } from "./http.js";

export class RpcError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly status?: number,
  ) {
    super(message);
  }
}

export interface SignatureStatus {
  slot: number;
  confirmations: number | null;
  err: unknown;
  confirmationStatus: "processed" | "confirmed" | "finalized" | null;
}

// JSON-RPC errors worth retrying: node behind, slot skipped / not available yet.
const RETRYABLE_CODES = new Set([-32004, -32005, -32007, -32014, -32016]);

export class Rpc {
  private id = 0;
  constructor(
    readonly url: string,
    readonly pacer: Pacer,
  ) {}

  async call<T = any>(method: string, params: unknown[] = [], retries = 4): Promise<T> {
    let lastErr: Error = new RpcError(`${method}: no attempt made`);
    for (let attempt = 0; attempt <= retries; attempt++) {
      await this.pacer.acquire();
      const r = await postJson(this.url, { jsonrpc: "2.0", id: ++this.id, method, params });
      if (r.status === 200 && r.json && !r.json.error) return r.json.result as T;
      if (r.status === 429) {
        this.pacer.backoff(1_000 * (attempt + 1));
        lastErr = new RpcError(`${method}: HTTP 429 from RPC`, undefined, 429);
        continue;
      }
      if (r.json?.error) {
        const { code, message } = r.json.error;
        if (!RETRYABLE_CODES.has(code)) throw new RpcError(`${method}: ${message}`, code, r.status);
        lastErr = new RpcError(`${method}: ${message}`, code, r.status);
      } else {
        lastErr = new RpcError(`${method}: HTTP ${r.status} ${r.error ?? r.text.slice(0, 200)}`, undefined, r.status);
      }
      await sleep(300 * (attempt + 1));
    }
    throw lastErr;
  }

  getSlot(commitment = "processed") {
    return this.call<number>("getSlot", [{ commitment }], 1);
  }

  getBlockHeight(commitment = "confirmed") {
    return this.call<number>("getBlockHeight", [{ commitment }], 1);
  }

  async getBalance(address: string, commitment = "confirmed") {
    return (await this.call<{ value: number }>("getBalance", [address, { commitment }])).value;
  }

  async getLatestBlockhash(commitment = "confirmed") {
    return (
      await this.call<{ value: { blockhash: string; lastValidBlockHeight: number } }>("getLatestBlockhash", [
        { commitment },
      ])
    ).value;
  }

  async getAccountInfo(address: string, commitment = "confirmed") {
    return (
      await this.call<{ value: { data: [string, string]; lamports: number; owner: string } | null }>(
        "getAccountInfo",
        [address, { encoding: "base64", commitment }],
      )
    ).value;
  }

  async getSignatureStatuses(signatures: string[], searchTransactionHistory = false, retries = 1) {
    return (
      await this.call<{ value: (SignatureStatus | null)[] }>(
        "getSignatureStatuses",
        [signatures, { searchTransactionHistory }],
        retries,
      )
    ).value;
  }

  getGenesisHash() {
    return this.call<string>("getGenesisHash");
  }

  getMinimumBalanceForRentExemption(bytes: number) {
    return this.call<number>("getMinimumBalanceForRentExemption", [bytes]);
  }

  async getFeeForMessage(messageBase64: string) {
    return (await this.call<{ value: number | null }>("getFeeForMessage", [messageBase64, { commitment: "confirmed" }]))
      .value;
  }

  async simulate(txBase64: string) {
    return (
      await this.call<{ value: { err: unknown; logs: string[] | null; unitsConsumed?: number } }>(
        "simulateTransaction",
        [txBase64, { encoding: "base64", sigVerify: false, replaceRecentBlockhash: false, commitment: "processed" }],
      )
    ).value;
  }

  getTransaction(signature: string) {
    return this.call<any>("getTransaction", [
      signature,
      { encoding: "json", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
    ]);
  }

  getSignaturesForAddress(address: string, limit = 1000, before?: string) {
    return this.call<{ signature: string; slot: number; err: unknown; blockTime: number | null }[]>(
      "getSignaturesForAddress",
      [address, { limit, commitment: "confirmed", ...(before ? { before } : {}) }],
    );
  }
}
