import { createCacheDriver } from "./cacheDriver";
import { storedEntry } from "./cacheFactory";

describe("reconcileWorkObjects", () => {
  it("deletes entries whose work object is no longer valid", async () => {
    const d = createCacheDriver(
      {},
      Object.fromEntries([storedEntry("things", "a", { workObjectId: "wo-1" })]),
    );
    await d.hydrate();

    const summary = await d.pool.reconcileWorkObjects(new Set());

    expect(summary.reconciled).toBe(1);
    expect(d.entries()).toEqual([]);
  });

  it("keeps entries whose work object is still valid", async () => {
    const d = createCacheDriver(
      {},
      Object.fromEntries([storedEntry("things", "a", { workObjectId: "wo-1" })]),
    );
    await d.hydrate();

    await d.pool.reconcileWorkObjects(new Set(["wo-1"]));

    expect(d.entries()).toHaveLength(1);
  });

  it("never touches entries with no work object", async () => {
    const d = createCacheDriver(
      {},
      Object.fromEntries([storedEntry("things", "a", { workObjectId: null })]),
    );
    await d.hydrate();

    await d.pool.reconcileWorkObjects(new Set());

    expect(d.entries()).toHaveLength(1);
  });

  it("frees the underlying file for a reconciled-away entry", async () => {
    const d = createCacheDriver(
      {},
      Object.fromEntries([storedEntry("things", "a", { workObjectId: "wo-1" })]),
    );
    d.fileStorage.seedFile("things", "a.bin", 1024);
    await d.hydrate();

    await d.pool.reconcileWorkObjects(new Set());

    expect(d.fileStorage.dump()).toEqual({});
  });

  it("reports zero ttl/budget evictions alongside a reconciliation", async () => {
    const d = createCacheDriver(
      {},
      Object.fromEntries([storedEntry("things", "a", { workObjectId: "wo-1" })]),
    );
    await d.hydrate();

    const summary = await d.pool.reconcileWorkObjects(new Set());

    expect(summary).toEqual({
      reconciled: 1,
      evictedForTtl: 0,
      evictedForBudget: 0,
      bytesFreed: 1024,
    });
  });

  it("handles a mix of areas and work objects in one pass", async () => {
    const things = {
      area: "things",
      schemaVersion: 1,
      priority: 10,
      ttlMs: null,
      fileNameGenerator: (id: string) => `${id}.bin`,
      sources: [],
    };
    const other = {
      area: "other",
      schemaVersion: 1,
      priority: 10,
      ttlMs: null,
      fileNameGenerator: (id: string) => `${id}.bin`,
      sources: [],
    };
    const d = createCacheDriver(
      { areas: [things, other] },
      Object.fromEntries([
        storedEntry("things", "a", { workObjectId: "wo-1" }),
        storedEntry("other", "b", { workObjectId: "wo-2" }),
        storedEntry("things", "c", { workObjectId: "wo-3" }),
      ]),
    );
    await d.hydrate();

    await d.pool.reconcileWorkObjects(new Set(["wo-1", "wo-2"]));

    expect(
      d
        .entries()
        .map((e) => e.id)
        .sort(),
    ).toEqual(["a", "b"]);
  });

  it("reconciling an empty cache is a no-op", async () => {
    const d = createCacheDriver();
    await d.hydrate();

    const summary = await d.pool.reconcileWorkObjects(new Set(["wo-1"]));

    expect(summary).toEqual({
      reconciled: 0,
      evictedForTtl: 0,
      evictedForBudget: 0,
      bytesFreed: 0,
    });
  });
});
