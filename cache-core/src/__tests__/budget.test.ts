import type { CacheAreaConfig } from "../types";
import { createCacheDriver } from "./cacheDriver";
import { storedEntry } from "./cacheFactory";

const lowpri: CacheAreaConfig = {
  area: "lowpri",
  schemaVersion: 1,
  priority: 10,
  ttlMs: null,
  fileNameGenerator: (id) => `${id}.bin`,
  sources: [],
};

const hipri: CacheAreaConfig = {
  area: "hipri",
  schemaVersion: 1,
  priority: 20,
  ttlMs: null,
  fileNameGenerator: (id) => `${id}.bin`,
  sources: [],
};

describe("budget eviction", () => {
  it("does nothing while under budget", async () => {
    const d = createCacheDriver(
      { areas: [lowpri], totalBudgetBytes: 1_000 },
      Object.fromEntries([storedEntry("lowpri", "a", { sizeBytes: 500 })]),
    );
    await d.hydrate();

    const summary = await d.pool.runEviction();

    expect(summary.evictedForBudget).toBe(0);
    expect(d.entries()).toHaveLength(1);
  });

  it("evicts the lower-priority area before the higher-priority one", async () => {
    const d = createCacheDriver(
      { areas: [lowpri, hipri], totalBudgetBytes: 500 },
      Object.fromEntries([
        storedEntry("lowpri", "a", { sizeBytes: 300 }),
        storedEntry("hipri", "b", { sizeBytes: 300 }),
      ]),
    );
    await d.hydrate();

    await d.pool.runEviction();

    expect(d.entries().map((e) => e.id)).toEqual(["b"]);
  });

  it("evicts least-recently-used first within an area", async () => {
    const d = createCacheDriver(
      { areas: [lowpri], totalBudgetBytes: 300 },
      Object.fromEntries([
        storedEntry("lowpri", "old", {
          sizeBytes: 200,
          lastAccessedAt: "2026-01-01T00:00:00.000Z",
        }),
        storedEntry("lowpri", "new", {
          sizeBytes: 200,
          lastAccessedAt: "2026-01-01T00:10:00.000Z",
        }),
      ]),
    );
    await d.hydrate();

    await d.pool.runEviction();

    expect(d.entries().map((e) => e.id)).toEqual(["new"]);
  });

  it("stops evicting as soon as it is back under budget", async () => {
    const d = createCacheDriver(
      { areas: [lowpri], totalBudgetBytes: 250 },
      Object.fromEntries([
        storedEntry("lowpri", "a", {
          sizeBytes: 100,
          lastAccessedAt: "2026-01-01T00:00:00.000Z",
        }),
        storedEntry("lowpri", "b", {
          sizeBytes: 100,
          lastAccessedAt: "2026-01-01T00:01:00.000Z",
        }),
        storedEntry("lowpri", "c", {
          sizeBytes: 100,
          lastAccessedAt: "2026-01-01T00:02:00.000Z",
        }),
      ]),
    );
    await d.hydrate();

    const summary = await d.pool.runEviction();

    expect(summary.evictedForBudget).toBe(1);
    expect(
      d
        .entries()
        .map((e) => e.id)
        .sort(),
    ).toEqual(["b", "c"]);
  });

  it("frees the file when evicting, not just the index entry", async () => {
    const d = createCacheDriver(
      { areas: [lowpri], totalBudgetBytes: 0 },
      Object.fromEntries([storedEntry("lowpri", "a", { sizeBytes: 100 })]),
    );
    d.fileStorage.seedFile("lowpri", "a.bin", 100);
    await d.hydrate();

    await d.pool.runEviction();

    expect(d.fileStorage.dump()).toEqual({});
  });

  it("a getCachedFile access keeps an entry alive through the next sweep", async () => {
    const d = createCacheDriver(
      { areas: [lowpri], totalBudgetBytes: 150 },
      Object.fromEntries([
        storedEntry("lowpri", "old", {
          sizeBytes: 100,
          lastAccessedAt: "2026-01-01T00:00:00.000Z",
        }),
        storedEntry("lowpri", "touched", {
          sizeBytes: 100,
          lastAccessedAt: "2026-01-01T00:00:00.000Z",
        }),
      ]),
    );
    d.fileStorage.seedFile("lowpri", "touched.bin", 100);
    await d.hydrate();

    d.advance(1_000);
    d.pool.getCachedFile("lowpri", "touched");

    await d.pool.runEviction();

    expect(d.entries().map((e) => e.id)).toEqual(["touched"]);
  });

  it("evicts across areas together, not one area at a time", async () => {
    const d = createCacheDriver(
      { areas: [lowpri, hipri], totalBudgetBytes: 100 },
      Object.fromEntries([
        storedEntry("lowpri", "a", { sizeBytes: 100 }),
        storedEntry("hipri", "b", { sizeBytes: 100 }),
      ]),
    );
    await d.hydrate();

    const summary = await d.pool.runEviction();

    // total is 200 against a 100 budget - only the lower-priority entry
    // needs to go to get back under budget, regardless of which area it's in
    expect(summary.evictedForBudget).toBe(1);
    expect(d.entries().map((e) => e.id)).toEqual(["b"]);
  });
});
