/**
 * Spend cap. Each operation books its worst case before anything is sent, then
 * swaps that for its actual cost once resolved. New operations start only if the
 * booked total plus their own worst case stays under the cap.
 */
export class Budget {
  private reserved = new Map<string, number>();
  private settledLamports = 0;

  constructor(readonly capLamports: number) {}

  committed(): number {
    let total = this.settledLamports;
    for (const v of this.reserved.values()) total += v;
    return total;
  }

  settled(): number {
    return this.settledLamports;
  }

  canStart(worstCaseLamports: number): boolean {
    return this.committed() + worstCaseLamports <= this.capLamports;
  }

  /** Book (or raise) an operation's worst case. Never lowers an existing booking. */
  reserve(op: string, lamports: number): void {
    this.reserved.set(op, Math.max(this.reserved.get(op) ?? 0, lamports));
  }

  /** Replace the booking with what the operation really cost. */
  settle(op: string, actualLamports: number): void {
    this.reserved.delete(op);
    this.settledLamports += actualLamports;
  }
}
