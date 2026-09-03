import type { CacheAreaConfig } from "../types";
import { createCacheDriver } from "./cacheDriver";
import { storedEntry } from "./cacheFactory";

const expiring: CacheAreaConfig = {
  area: "things",
  schemaVersion: 1,
  priority: 10,
  ttlMs: 60_000,
  fileNameGenerator: (id) => `${id}.bin`,
  sources: [],
};

describe("ttl eviction", () => {
  it("evicts an entry once it is older than its area's ttl", async () => {
    const d = createCacheDriver(
      { areas: [expiring], totalBudgetBytes: 1_000_000 },
      Object.fromEntries([storedEntry("things", "a")]),
    );
    await d.hydrate();

    d.advance(60_001);
    const summary = await d.pool.runEviction();

    expect(summary.evictedForTtl).toBe(1);
    expect(d.entries()).toEqual([]);
  });

  it("leaves an entry alone before its ttl elapses", async () => {
    const d = createCacheDriver(
      { areas: [expiring], totalBudgetBytes: 1_000_000 },
      Object.fromEntries([storedEntry("things", "a")]),
    );
    await d.hydrate();

    d.advance(59_999);
    await d.pool.runEviction();

    expect(d.entries()).toHaveLength(1);
  });

  it("never expires an area configured with a null ttl", async () => {
    const d = createCacheDriver(
      { areas: [{ ...expiring, ttlMs: null }], totalBudgetBytes: 1_000_000 },
      Object.fromEntries([storedEntry("things", "a")]),
    );
    await d.hydrate();

    d.advance(365 * 24 * 60 * 60_000);
    await d.pool.runEviction();

    expect(d.entries()).toHaveLength(1);
  });

  it("measures ttl from the last access, not the download time", async () => {
    const d = createCacheDriver(
      { areas: [expiring], totalBudgetBytes: 1_000_000 },
      Object.fromEntries([storedEntry("things", "a")]),
    );
    d.fileStorage.seedFile("things", "a.bin", 1024);
    await d.hydrate();

    d.advance(50_000);
    d.pool.getCachedFile("things", "a"); // touch
    d.advance(50_000); // 100_000ms since download, but 50_000 since last touch

    await d.pool.runEviction();

    expect(d.entries()).toHaveLength(1);
  });

  it("frees the file when a ttl eviction fires", async () => {
    const d = createCacheDriver(
      { areas: [expiring], totalBudgetBytes: 1_000_000 },
      Object.fromEntries([storedEntry("things", "a")]),
    );
    d.fileStorage.seedFile("things", "a.bin", 1024);
    await d.hydrate();

    d.advance(60_001);
    await d.pool.runEviction();

    expect(d.fileStorage.dump()).toEqual({});
  });

  it("runs ttl eviction before budget eviction, against the reduced total", async () => {
    // one ttl-expired entry alone would blow the budget if it weren't
    // cleared first - budget eviction should never need to touch anything
    // else here.
    const d = createCacheDriver(
      { areas: [expiring], totalBudgetBytes: 1_000 },
      Object.fromEntries([
        storedEntry("things", "expired", { sizeBytes: 900 }),
        storedEntry("things", "fresh", {
          sizeBytes: 100,
          lastAccessedAt: "2026-01-01T00:00:59.999Z",
        }),
      ]),
    );
    await d.hydrate();

    d.advance(60_001);
    const summary = await d.pool.runEviction();

    expect(summary.evictedForTtl).toBe(1);
    expect(summary.evictedForBudget).toBe(0);
    expect(d.entries().map((e) => e.id)).toEqual(["fresh"]);
  });
});
