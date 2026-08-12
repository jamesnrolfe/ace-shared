import { createQueueDriver } from "./queueDriver";
import { retryableFail, storedEntry, uploaded } from "./queueFactory";

const abandoned = (id: string, attempts = 0) =>
  storedEntry(id, {
    status: "IN_FLIGHT",
    attempts,
    leaseExpiresAt: "2026-01-01T00:00:30.000Z",
  });

describe("leases", () => {
  it("returns an entry to the queue once its leases lapses", async () => {
    const q = createQueueDriver({}, Object.fromEntries([abandoned("a")]));
    q.uploader.respondWith(retryableFail());

    q.advance(30_001);
    await q.run();

    // the killed entry was retried in the same pass and failed
    // once. Had the crash itself counted, this would be 2
    expect((await q.entry("a"))?.attempts).toBe(1);
  });

  it("uploads a killed entry rather than leaving it stranded", async () => {
    const q = createQueueDriver({}, Object.fromEntries([abandoned("a")]));
    q.uploader.respondWith(uploaded("done"));

    q.advance(30_001);
    await q.run();

    expect(q.storedIds()).toEqual([]);
  });

  it("frees the concurrency slot a dead worker was holding", async () => {
    const q = createQueueDriver(
      { concurrency: 1 },
      Object.fromEntries([abandoned("a")]),
    );

    q.advance(30_001); // after backoff
    await q.run();

    // without killing, "a" holds the only slot forever and nothing ever runs
    expect(q.uploader.calls().map((p) => p.id)).toEqual(["a"]);
  });

  it("keeps an entry in flight while its lease is still live", async () => {
    const q = createQueueDriver({}, Object.fromEntries([abandoned("a")]));

    q.advance(29_000);
    const summary = await q.run();

    expect(summary.killed).toBe(0);
    expect((await q.statuses()).a).toBe("IN_FLIGHT");
  });
});
