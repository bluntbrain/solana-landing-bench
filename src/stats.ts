/** Nearest-rank quantile: an actual observed value, which reads better for whole slots. */
export function quantile(values: number[], q: number): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(q * sorted.length));
  return sorted[Math.min(rank, sorted.length) - 1];
}

export function share(values: number[], pred: (v: number) => boolean): number | undefined {
  if (values.length === 0) return undefined;
  return values.filter(pred).length / values.length;
}

export function mean(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Fisher-Yates shuffle (returns a new array). */
export function shuffle<T>(items: readonly T[], rand: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
