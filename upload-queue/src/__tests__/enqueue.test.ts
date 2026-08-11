import { createQueueDriver } from "./queueDriver";

describe("enqueue", () => {
  it("persists the entry before reporting it queued", async () => {
    const q = createQueueDriver();

    const outcome = await q.add("a");

    expect(outcome).toEqual({ ok: true, value: "a" });
    expect(q.storedIds()).toEqual(["a"]);
  });

  it("reports failure when the write fails, and stores nothing", async () => {
    const q = createQueueDriver();
    q.storage.failWrites(1, "database or disk is full");

    const outcome = await q.add("a");

    expect(outcome).toEqual({ ok: false, error: "database or disk is full" });
    expect(q.storedIds()).toEqual([]);
    expect(await q.entries()).toEqual([]);
  });

  it("never uploads an entry that it could not persist", async () => {
    const q = createQueueDriver();
    q.storage.failWrites(1);

    await q.add("a");
    await q.run();

    // nothing uploaded
    expect(q.uploader.calls()).toEqual([]);
  });

  it("treats the same id as the same job", async () => {
    const q = createQueueDriver();

    await q.add("a", "first");
    await q.add("a", "second");

    const all = await q.entries();
    expect(all).toHaveLength(1);
    // second should overwrite first
    expect(all[0].payload.label).toBe("second");
  });

  it("makes a new entry due immediately", async () => {
    const q = createQueueDriver();

    await q.add("a");
    const summary = await q.run();

    expect(summary.succeeded).toBe(1);
    expect(q.storedIds()).toEqual([]);
  });
});
