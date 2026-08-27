export interface TimingStats {
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
}

export interface TimedOptions {
  verbose?: boolean;
  thresholdMs?: number;
}

let enabled = false;
const stats = new Map<string, TimingStats>();

export function setTimingEnabled(value: boolean): void {
  enabled = value;
}

export function isTimingEnabled(): boolean {
  return enabled;
}

function record(
  label: string,
  durationMs: number,
  options?: TimedOptions,
): void {
  if (durationMs < (options?.thresholdMs ?? 0)) return;

  const existing = stats.get(label);
  if (existing) {
    existing.count += 1;
    existing.totalMs += durationMs;
    existing.minMs = Math.min(existing.minMs, durationMs);
    existing.maxMs = Math.max(existing.maxMs, durationMs);
  } else {
    stats.set(label, {
      count: 1,
      totalMs: durationMs,
      minMs: durationMs,
      maxMs: durationMs,
    });
  }

  if (options?.verbose) {
    console.log(`[timing] ${label}: ${durationMs.toFixed(2)}ms`);
  }
}

export function timed<T>(
  label: string,
  fn: () => T,
  options?: TimedOptions,
): T {
  if (!enabled) return fn();
  const start = performance.now();
  try {
    return fn();
  } finally {
    record(label, performance.now() - start, options);
  }
}

/** Time one async call to `fn` - the full duration until it settles. */
export async function timedAsync<T>(
  label: string,
  fn: () => Promise<T>,
  options?: TimedOptions,
): Promise<T> {
  if (!enabled) return fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    record(label, performance.now() - start, options);
  }
}

/**
 * Wrap a function once at its definition, returning an instrumented
 * version with the same signature - every call through it is timed under
 * `label`. Handles both sync and async functions (an async fn's returned
 * promise is awaited before recording).
 */
export function withTiming<Args extends unknown[], T>(
  label: string,
  fn: (...args: Args) => T,
  options?: TimedOptions,
): (...args: Args) => T {
  return (...args: Args): T => {
    if (!enabled) return fn(...args);
    const start = performance.now();
    const result = fn(...args);

    if (result instanceof Promise) {
      return result.finally(() => {
        record(label, performance.now() - start, options);
      }) as T;
    }

    record(label, performance.now() - start, options);
    return result;
  };
}

/** Print a summary of everything recorded, sorted by total time spent
 * (the biggest cumulative cost first - usually more actionable than
 * sorting by a single slowest call). */
export function logTimingStats(): void {
  const rows = Array.from(stats.entries())
    .map(([label, s]) => ({
      label,
      count: s.count,
      totalMs: Math.round(s.totalMs * 100) / 100,
      avgMs: Math.round((s.totalMs / s.count) * 100) / 100,
      minMs: Math.round(s.minMs * 100) / 100,
      maxMs: Math.round(s.maxMs * 100) / 100,
    }))
    .sort((a, b) => b.totalMs - a.totalMs);

  if (rows.length === 0) {
    console.log("[timing] No timed calls recorded.");
    return;
  }

  if (typeof console.table === "function") {
    console.table(rows);
  } else {
    for (const r of rows) {
      console.log(
        `[timing] ${r.label}: count=${r.count} total=${r.totalMs}ms avg=${r.avgMs}ms min=${r.minMs}ms max=${r.maxMs}ms`,
      );
    }
  }
}
