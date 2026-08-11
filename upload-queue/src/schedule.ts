/**
 * Exponential backoff with full jitter, capped.
 *
 * Jitter matters here - without it, a queue that failed as a batch
 * retries as a batch, which batters the endpoint.
 */
export function exponentialBackoff(
  baseMs = 5_000,
  capMs = 15 * 60_000,
  random: () => number = Math.random,
): (attemps: number) => number {
  return (attempts) => {
    const ceiling = Math.min(capMs, baseMs * 2 ** Math.max(0, attempts - 1));
    return Math.round(ceiling / 2 + random() * (ceiling / 2));
  };
}

/**
 * Is this entry eligible to be claimed at `now`?
 */
export function isDue(nextAttemptAt: string, now: number): boolean {
  return new Date(nextAttemptAt).getTime() <= now;
}

/**
 * Has an in-flight entry's lease lapsed, making it claimable again?
 */
export function isLeaseExpired(
  leaseExpiresAt: string | null,
  now: number,
): boolean {
  if (!leaseExpiresAt) return true;
  return new Date(leaseExpiresAt).getTime() <= now;
}
