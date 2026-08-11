import { createQueueDriver } from "./queueDriver";
import { permanentFail, retryableFail, uploaded } from "./queueFactory";

describe("retry and failure", () => {
  it("marks a retryable failure FAILED and schedules another attempt", async () => {
    const q = createQueueDriver({ maxAttempts: 3, backoffMs: () => 10_000 });
    q.uploader.respondWith(retryableFail("network down"));

    await q.add("a");
    await q.run();

    const entry = await q.entry("a");
    expect(entry?.status).toBe("FAILED");
    expect(entry?.attempts).toBe(1);
    expect(entry?.lastError).toEqual({
      message: "network down",
      retryable: true,
    });
    // next attempt is determined by backoffMs: 10s after original attempt
    expect(entry?.nextAttemptAt).toBe("2026-01-01T00:00:10.000Z");
  });

  it("kills a non-retryable failure immediately, without spending attempts", async () => {
    const q = createQueueDriver({ maxAttempts: 5 });
    q.uploader.respondWith(permanentFail("invalid params"));

    await q.add("a");
    await q.run();

    expect((await q.entry("a"))?.status).toBe("DEAD");
    expect(q.uploader.calls()).toHaveLength(1);
  });

  it("stops claiming a DEAD entry", async () => {
    const q = createQueueDriver({ maxAttempts: 1 });
    q.uploader.respondWith(retryableFail());

    await q.add("a");
    await q.run();
    q.advance(3_600_000);

    // nothing claimed in the future
    expect((await q.run()).claimed).toBe(0);
  });

  it("notifies onDead once, with the error that just killed it", async () => {
    const onDead = jest.fn();
    const q = createQueueDriver({ maxAttempts: 1, onDead });
    q.uploader.respondWith(permanentFail("gone", "NOT_FOUND"));

    await q.add("a");
    await q.run();
    q.advance(3_600_000);
    await q.run();

    expect(onDead).toHaveBeenCalledTimes(1);
    expect(onDead).toHaveBeenCalledWith(
      { id: "a", label: undefined },
      { message: "gone", code: "NOT_FOUND", retryable: false },
    );
  });

  it("revives a DEAD entry on an explicit retry", async () => {
    const q = createQueueDriver({ maxAttempts: 1 });
    q.uploader.respondWith(retryableFail());

    await q.add("a");
    await q.run();
    expect((await q.entry("a"))?.status).toBe("DEAD");

    q.uploader.respondWith(uploaded("done"));
    await q.core.retryNow("a");
    await q.run();

    expect(q.storedIds()).toEqual([]);
  });

  it("reports a retry of an entry that is not there", async () => {
    const q = createQueueDriver();

    // note if err msg changes, change here
    expect(await q.core.retryNow("nope")).toEqual({
      ok: false,
      error: "No entry nope in queue.",
    });
  });

  it("hands the uploaded value to onSuccess", async () => {
    const onSuccess = jest.fn();
    const q = createQueueDriver({ onSuccess });
    q.uploader.respondWith(uploaded("sas-token"));

    await q.add("a");
    await q.run();

    expect(onSuccess).toHaveBeenCalledWith(
      { id: "a", label: undefined },
      "sas-token",
    );
  });
});
