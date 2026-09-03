import { CacheEntry } from "./types";

/**
 * Is `entry.lastAccessedAt` past its TTL as of `now`?
 *
 * `ttlMs === null` never expires.
 */
export function isExpired(
  entry: CacheEntry,
  ttlMs: number | null,
  now: number,
): boolean {
  if (ttlMs === null) return false;
  return now - new Date(entry.lastAccessedAt).getTime() > ttlMs;
}

/**
 * Entries whose `workObjectId` is set but absent from `validWorkObjects`.
 *
 * Entries with `workObjectId === null` are never selected here. They aren't
 * tied to a work objects's lifecycle.
 */
export function getEntriesToReconcile(
  entries: ReadonlyArray<CacheEntry>,
  validWorkObjects: ReadonlySet<string>,
): ReadonlyArray<CacheEntry> {
  return entries.filter(
    (e) => e.workObjectId !== null && !validWorkObjects.has(e.workObjectId),
  );
}

/**
 * Entries past their area's TTL, independent of budget pressure.
 */
export function getEntriesToEvictTTL(
  entries: ReadonlyArray<CacheEntry>,
  ttlMsByArea: ReadonlyMap<string, number | null>,
  now: number,
): ReadonlyArray<CacheEntry> {
  return entries.filter((e) =>
    isExpired(e, ttlMsByArea.get(e.area) ?? null, now),
  );
}

/**
 * Entries to delete to bring `entries`' total size back under
 * `totalBudgetBytes`: lowest-priority area first, then
 * least recently used within a area.
 *
 * Stops as soon as the running total would be back under budget:
 * does not over-evict.
 */
export function getEntriesToEvictBudgetPressure(
  entries: ReadonlyArray<CacheEntry>,
  priorityByArea: ReadonlyMap<string, number>,
  totalBudgetBytes: number,
): ReadonlyArray<CacheEntry> {
  // reduce to find total size in bytes
  const totalBytes = entries.reduce((sum, e) => sum + e.sizeBytes, 0);
  let over = totalBytes - totalBudgetBytes;
  if (over <= 0) return []; // no need to delete any

  // order by priority unless they have the same priority,
  // in which case order by lastAccessedAt
  const ordered = [...entries].sort((a, b) => {
    const priorityDiff =
      (priorityByArea.get(a.area) ?? 0) - (priorityByArea.get(b.area) ?? 0);
    if (priorityDiff !== 0) return priorityDiff;
    return (
      new Date(a.lastAccessedAt).getTime() -
      new Date(b.lastAccessedAt).getTime()
    );
  });

  const evictions: CacheEntry[] = [];
  // del until over <= 0 (diff between total and budget)
  for (const entry of ordered) {
    if (over <= 0) break;
    evictions.push(entry);
    over -= entry.sizeBytes;
  }
  return evictions;
}
