import { createCacheDriver } from "./cacheDriver";
import { storedEntry } from "./cacheFactory";

describe("rehydrating from storage", () => {
  it("restores every stored entry", async () => {
    const d = createCacheDriver(
      {},
      Object.fromEntries([storedEntry("things", "a"), storedEntry("things", "b")]),
    );

    await d.hydrate();

    expect(
      d
        .entries()
        .map((e) => e.id)
        .sort(),
    ).toEqual(["a", "b"]);
  });

  it("restores every field of a stored entry, not just its id", async () => {
    const d = createCacheDriver(
      {},
      Object.fromEntries([
        storedEntry("things", "a", {
          workObjectId: "wo-1",
          sizeBytes: 2048,
          downloadedAt: "2026-01-01T00:00:00.000Z",
          lastAccessedAt: "2026-01-02T00:00:00.000Z",
        }),
      ]),
    );

    await d.hydrate();

    expect(d.entry("things", "a")).toEqual({
      id: "a",
      area: "things",
      workObjectId: "wo-1",
      sizeBytes: 2048,
      downloadedAt: "2026-01-01T00:00:00.000Z",
      lastAccessedAt: "2026-01-02T00:00:00.000Z",
      schemaVersion: 1,
    });
  });

  it("drops one unreadable entry without losing the rest", async () => {
    const d = createCacheDriver(
      {},
      {
        ...Object.fromEntries([storedEntry("things", "a")]),
        "CACHE:u1:things:bad": "{{{ not json",
      },
    );

    await d.hydrate();

    expect(d.entries().map((e) => e.id)).toEqual(["a"]);
    // the unreadable key is cleared rather than reread on every hydrate
    expect(d.storedIds()).toEqual(["a"]);
  });

  it("ignores keys belonging to another user", async () => {
    const d = createCacheDriver(
      {},
      {
        ...Object.fromEntries([storedEntry("things", "a")]),
        "CACHE:u2:things:theirs": storedEntry("things", "theirs")[1],
      },
    );

    await d.hydrate();

    expect(d.entries().map((e) => e.id)).toEqual(["a"]);
  });

  it("drops an entry for an area this build no longer configures", async () => {
    const d = createCacheDriver({}, Object.fromEntries([storedEntry("gone-area", "a")]));

    await d.hydrate();

    expect(d.entries()).toEqual([]);
    expect(d.storedIds()).toEqual([]);
  });

  it("drops a stale schema version - there is no cache migration, only re-download", async () => {
    const d = createCacheDriver(
      {},
      Object.fromEntries([storedEntry("things", "a", { schemaVersion: 999 })]),
    );

    await d.hydrate();

    expect(d.entries()).toEqual([]);
    expect(d.storedIds()).toEqual([]);
  });

  it("is additive across repeated hydrate() calls rather than clearing first", async () => {
    const d = createCacheDriver({}, Object.fromEntries([storedEntry("things", "a")]));

    await d.hydrate();
    await d.ensure("things", "b");
    await d.hydrate();

    expect(
      d
        .entries()
        .map((e) => e.id)
        .sort(),
    ).toEqual(["a", "b"]);
  });

  it("surfaces a storage read failure rather than silently reporting an empty cache", async () => {
    const d = createCacheDriver();
    d.storage.keys = async () => {
      throw new Error("storage unavailable");
    };

    await expect(d.hydrate()).rejects.toThrow("storage unavailable");
  });
});
