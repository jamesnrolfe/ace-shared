import { createQueueDriver } from "./queueDriver";
import { retryableFail, storedEntry, uploaded } from "./queueFactory";

describe("claiming", () => {
  it("never runs more uploads at once than the configured concurrency", async () => {
    const q = createQueueDriver({ concurrency: 2 });

    for (const id of ["a", "b", "c", "d", "e", "f"]) await q.add(id);
    await q.run();

    expect(q.uploader.peakConcurrency()).toBeLessThanOrEqual(2);
    expect(q.uploader.calls()).toHaveLength(2);
  });

  it("drains the remainder on later passes", async () => {
    const q = createQueueDriver({ concurrency: 2 });

    for (const id of ["a", "b", "c"]) await q.add(id);
    await q.run();
    await q.run();

    expect(q.storedIds()).toEqual([]);
  });

  it("takes the oldest entries first", async () => {
    const q = createQueueDriver({ concurrency: 1 });

    await q.add("first");
    q.advance(1_000);
    await q.add("second");
    await q.run();

    // ran with concurrency: 1 so we should have only drained "first"
    // in one run() step, since "second" was added 1_000ms after
    expect(q.uploader.calls().map((p) => p.id)).toEqual(["first"]);
  });

  it("will not claim an entry whose backoff has not elapsed", async () => {
    const q = createQueueDriver({ backoffMs: () => 60_000 });
    q.uploader.respondWith(retryableFail());

    await q.add("a");
    await q.run();

    q.uploader.respondWith(uploaded("done"));
    // only advance 30_000 (not as much as the backoff hardcoded 60_000)
    q.advance(30_000);

    expect((await q.run()).claimed).toBe(0);
  });

  it("claims again once the backoff has elapsed", async () => {
    const q = createQueueDriver({ backoffMs: () => 60_000 });
    q.uploader.respondWith(retryableFail());

    await q.add("a");
    await q.run();

    q.uploader.respondWith(uploaded("done"));
    q.advance(60_001);

    expect((await q.run()).succeeded).toBe(1);
    expect(q.storedIds()).toEqual([]);
  });

  it("leaves a live lease alone, so a second worker cannot double-claim", async () => {
    const q = createQueueDriver(
      { concurrency: 1 },
      Object.fromEntries([
        storedEntry("a", {
          status: "IN_FLIGHT",
          // claimed 10s ago by a worker still running; lease runs to +30s
          leaseExpiresAt: "2026-01-01T00:00:30.000Z",
        }),
      ]),
    );

    const summary = await q.run();

    expect(summary.claimed).toBe(0);
    expect(q.uploader.calls()).toEqual([]);
    expect((await q.statuses()).a).toBe("IN_FLIGHT");
  });

  it("removes a successful entry from storage, not just from the list", async () => {
    const q = createQueueDriver();

    await q.add("a");
    await q.run();

    expect(q.storedIds()).toEqual([]);
    expect(await q.entries()).toEqual([]);
  });
});
