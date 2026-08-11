import { createQueueDriver } from "./queueDriver";
import { storedEntry } from "./queueFactory";

describe("rehydrating from storage", () => {
  it("restores every stored entry", async () => {
    const q = createQueueDriver(
      {},
      Object.fromEntries([storedEntry("a"), storedEntry("b")]),
    );

    expect(await q.statuses()).toEqual({ a: "PENDING", b: "PENDING" });
  });

  it("drops one unreadable entry without losing the rest", async () => {
    const q = createQueueDriver(
      {},
      {
        ...Object.fromEntries([storedEntry("a"), storedEntry("b")]),
        "QUEUE:test:u1:bad": "{{{ not json",
      },
    );

    expect(await q.statuses()).toEqual({ a: "PENDING", b: "PENDING" });
    // the unreadable key is cleared rather than reread on every pass
    expect(q.storedIds().sort()).toEqual(["a", "b"]);
  });

  it("ignores keys belonging to another user", async () => {
    const q = createQueueDriver(
      {},
      {
        ...Object.fromEntries([storedEntry("a")]),
        "QUEUE:test:u2:theirs": storedEntry("theirs")[1],
      },
    );

    expect(await q.statuses()).toEqual({ a: "PENDING" });
  });

  it("migrates an entry written by an older build", async () => {
    const q = createQueueDriver(
      {
        schemaVersion: 2,
        migrate: (raw) => ({ id: (raw as { legacyId: string }).legacyId }),
      },
      Object.fromEntries([
        storedEntry("a", {
          schemaVersion: 1,
          payload: { legacyId: "a" } as never,
        }),
      ]),
    );

    const [entry] = await q.entries();
    expect(entry.payload).toEqual({ id: "a" });
    expect(entry.schemaVersion).toBe(2);
  });

  it("discards an entry the migration cannot handle", async () => {
    const q = createQueueDriver(
      { schemaVersion: 2, migrate: () => null },
      Object.fromEntries([storedEntry("a", { schemaVersion: 1 })]),
    );

    expect(await q.entries()).toEqual([]);
    expect(q.storedIds()).toEqual([]);
  });

  it("drops a stale entry when no migration is configured", async () => {
    const q = createQueueDriver(
      { schemaVersion: 2 },
      Object.fromEntries([storedEntry("a", { schemaVersion: 1 })]),
    );

    expect(await q.entries()).toEqual([]);
  });

  it("surfaces a storage read failure rather than reporting an empty queue", async () => {
    const q = createQueueDriver();
    q.storage.keys = async () => {
      throw new Error("storage unavailable");
    };

    expect(await q.core.list()).toEqual({
      ok: false,
      error: "storage unavailable",
    });
  });
});
