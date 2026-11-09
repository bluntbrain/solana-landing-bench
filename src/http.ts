import { EnvHttpProxyAgent, fetch } from "undici";

// Node's built-in fetch ignores HTTPS_PROXY; undici's EnvHttpProxyAgent honours
// HTTPS_PROXY / NO_PROXY and keeps connections alive between requests.
const dispatcher = new EnvHttpProxyAgent({ keepAliveTimeout: 60_000 });

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface HttpResult {
  status: number; // 0 = network error or timeout
  json: any;
  text: string;
  ms: number;
  error?: string;
}

async function request(url: string, init: { method: string; body?: string }, timeoutMs: number): Promise<HttpResult> {
  const t0 = performance.now();
  try {
    const res = await fetch(url, {
      method: init.method,
      headers: init.body ? { "content-type": "application/json" } : undefined,
      body: init.body,
      dispatcher,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    return { status: res.status, json, text, ms: performance.now() - t0 };
  } catch (e) {
    return { status: 0, json: undefined, text: "", ms: performance.now() - t0, error: (e as Error).message };
  }
}

export const postJson = (url: string, body: unknown, timeoutMs = 10_000) =>
  request(url, { method: "POST", body: JSON.stringify(body) }, timeoutMs);

export const getJson = (url: string, timeoutMs = 10_000) => request(url, { method: "GET" }, timeoutMs);

/**
 * Enforces a minimum spacing between requests that share a rate limit. Waiters with a
 * higher priority go first (a ladder's step-up or a cancel shouldn't queue behind new work).
 */
export class Pacer {
  private queue: { priority: number; resolve: () => void }[] = [];
  private last = 0;
  private timer?: NodeJS.Timeout;

  constructor(readonly intervalMs: number) {}

  acquire(priority = 0): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push({ priority, resolve });
      this.pump();
    });
  }

  /** Push the next slot back, e.g. after a 429. */
  backoff(ms: number): void {
    this.last = Math.max(this.last, Date.now() + ms - this.intervalMs);
  }

  private pump(): void {
    if (this.timer || this.queue.length === 0) return;
    const wait = Math.max(0, this.last + this.intervalMs - Date.now());
    this.timer = setTimeout(() => {
      this.timer = undefined;
      let best = 0;
      for (let i = 1; i < this.queue.length; i++) if (this.queue[i].priority > this.queue[best].priority) best = i;
      const [next] = this.queue.splice(best, 1);
      this.last = Date.now();
      next.resolve();
      this.pump();
    }, wait);
  }
}

export class Semaphore {
  private waiters: (() => void)[] = [];
  constructor(private free: number) {}

  async acquire(): Promise<void> {
    if (this.free > 0) {
      this.free--;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  release(): void {
    const next = this.waiters.shift();
    if (next) next();
    else this.free++;
  }
}
