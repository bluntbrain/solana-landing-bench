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

/** Enforces a minimum spacing between requests that share a rate limit. */
export class Pacer {
  private next = 0;
  constructor(readonly intervalMs: number) {}

  async acquire(): Promise<void> {
    const now = Date.now();
    const at = Math.max(now, this.next);
    this.next = at + this.intervalMs;
    if (at > now) await sleep(at - now);
  }

  /** Push the next slot back, e.g. after a 429. */
  backoff(ms: number): void {
    this.next = Math.max(this.next, Date.now() + ms);
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
