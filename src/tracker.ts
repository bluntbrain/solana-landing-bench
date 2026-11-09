import { sleep } from "./http.js";
import type { Rpc, SignatureStatus } from "./rpc.js";

/** Runs fn every intervalMs without overlapping calls, until stopped. */
class Loop {
  private running = false;
  constructor(
    private fn: () => Promise<void>,
    private intervalMs: number,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    void (async () => {
      while (this.running) {
        const t0 = Date.now();
        try {
          await this.fn();
        } catch {
          // transient RPC errors: try again next tick
        }
        await sleep(Math.max(0, this.intervalMs - (Date.now() - t0)));
      }
    })();
  }

  stop(): void {
    this.running = false;
  }
}

/** Our view of the cluster clock: latest processed slot and confirmed block height. */
export class SlotClock {
  slot = 0;
  blockHeight = 0;
  private loops: Loop[] = [];

  constructor(private rpc: Rpc) {}

  async start(): Promise<void> {
    this.slot = await this.rpc.getSlot("processed");
    this.blockHeight = await this.rpc.getBlockHeight("confirmed");
    this.loops = [
      new Loop(async () => {
        const s = await this.rpc.getSlot("processed");
        if (s > this.slot) this.slot = s;
      }, 400),
      new Loop(async () => {
        const h = await this.rpc.getBlockHeight("confirmed");
        if (h > this.blockHeight) this.blockHeight = h;
      }, 2_000),
    ];
    this.loops.forEach((l) => l.start());
  }

  stop(): void {
    this.loops.forEach((l) => l.stop());
  }
}

/** Keeps a recent confirmed blockhash so building a transaction never waits on the RPC. */
export class BlockhashCache {
  private latest?: { blockhash: string; lastValidBlockHeight: number };
  private loop?: Loop;

  constructor(private rpc: Rpc) {}

  async start(): Promise<void> {
    this.latest = await this.rpc.getLatestBlockhash("confirmed");
    this.loop = new Loop(async () => {
      this.latest = await this.rpc.getLatestBlockhash("confirmed");
    }, 5_000);
    this.loop.start();
  }

  get(): { blockhash: string; lastValidBlockHeight: number } {
    if (!this.latest) throw new Error("BlockhashCache not started");
    return this.latest;
  }

  stop(): void {
    this.loop?.stop();
  }
}

export interface Seen {
  processedSlot?: number;
  processedAtMs?: number;
  confirmedSlot?: number;
  confirmedAtMs?: number;
  err?: unknown;
}

const isConfirmed = (s: SignatureStatus) => s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized";

/** Polls getSignatureStatuses for every watched signature, 256 per call, every 400 ms. */
export class StatusTracker {
  private watched = new Map<string, Seen>();
  private loop: Loop;

  constructor(private rpc: Rpc) {
    this.loop = new Loop(() => this.poll(), 400);
  }

  start(): void {
    this.loop.start();
  }

  stop(): void {
    this.loop.stop();
  }

  watch(signature: string): Seen {
    let seen = this.watched.get(signature);
    if (!seen) {
      seen = {};
      this.watched.set(signature, seen);
    }
    return seen;
  }

  unwatch(signature: string): void {
    this.watched.delete(signature);
  }

  private async poll(): Promise<void> {
    const pending = [...this.watched.entries()].filter(([, s]) => s.confirmedSlot === undefined).map(([sig]) => sig);
    for (let i = 0; i < pending.length; i += 256) {
      const batch = pending.slice(i, i + 256);
      const statuses = await this.rpc.getSignatureStatuses(batch);
      const now = Date.now();
      statuses.forEach((st, j) => {
        const seen = st && this.watched.get(batch[j]);
        if (!st || !seen) return;
        if (seen.processedSlot === undefined) {
          seen.processedSlot = st.slot;
          seen.processedAtMs = now;
        }
        if (isConfirmed(st)) {
          seen.confirmedSlot = st.slot;
          seen.confirmedAtMs = now;
          seen.err = st.err ?? undefined;
        }
      });
    }
  }

  /** History search for signatures we're about to give up on. Fills in anything that did land. */
  async finalCheck(signatures: string[]): Promise<void> {
    for (let i = 0; i < signatures.length; i += 256) {
      const batch = signatures.slice(i, i + 256);
      const statuses = await this.rpc.getSignatureStatuses(batch, true, 4);
      const now = Date.now();
      statuses.forEach((st, j) => {
        if (!st || !isConfirmed(st)) return;
        const seen = this.watch(batch[j]);
        if (seen.confirmedSlot === undefined) {
          seen.processedSlot ??= st.slot;
          seen.processedAtMs ??= now;
          seen.confirmedSlot = st.slot;
          seen.confirmedAtMs = now;
          seen.err = st.err ?? undefined;
        }
      });
    }
  }
}
