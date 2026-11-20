import { unwrap } from "../../../ts-utils/src";
import { createQueueDriver } from "./queueDriver";
import {
  payload,
  permanentFail,
  retryableFail,
  type TestPayload,
  uploaded,
} from "./queueFactory";

describe("drain", () => {
  it("keeps running passes until nothing is due", async () => {
    const q = createQueueDriver({ concurrency: 2 });
    for (const id of ["a", "b", "c", "d", "e"]) await q.add(id);

    const summary = unwrap(await q.core.drain());

    expect(summary.claimed).toBe(5);
    expect(summary.succeeded).toBe(5);
    expect(q.storedIds()).toEqual([]);
  });

  it("stops after a pass with no successes", async () => {
    const q = createQueueDriver({ concurrency: 2 });
    for (const id of ["a", "b", "c", "d"]) await q.add(id);
    q.uploader.respondWith(retryableFail());

    const summary = unwrap(await q.core.drain());

    // one failing pass, then hands back rather than burning attempts on c, d
    expect(summary.claimed).toBe(2);
    expect(q.uploader.calls().map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("carries on past a pass that partly failed", async () => {
    const q = createQueueDriver({ concurrency: 2 });
    for (const id of ["a", "b", "c"]) await q.add(id);
    q.uploader.respondWith(retryableFail(), uploaded("done"));

    const summary = unwrap(await q.core.drain());

    expect(summary.succeeded).toBe(2);
    expect(summary.failed).toBe(1);
    expect(await q.statuses()).toEqual({ a: "FAILED" });
  });

  it("stops when shouldContinue says so, without asking before the first pass", async () => {
    const shouldContinue = jest.fn(() => false);
    const q = createQueueDriver({ concurrency: 1 });
    for (const id of ["a", "b"]) await q.add(id);

    const summary = unwrap(await q.core.drain({ shouldContinue }));

    expect(summary.claimed).toBe(1);
    expect(shouldContinue).toHaveBeenCalledTimes(1);
  });

  it("stops at maxPasses", async () => {
    const q = createQueueDriver({ concurrency: 1 });
    for (const id of ["a", "b", "c"]) await q.add(id);

    const summary = unwrap(await q.core.drain({ maxPasses: 2 }));

    expect(summary.claimed).toBe(2);
    expect(q.storedIds()).toEqual(["c"]);
  });

  it("calls afterPass per slot's worth of finished uploads, then at the end", async () => {
    const afterPass = jest.fn();
    const q = createQueueDriver({ concurrency: 2 });
    for (const id of ["a", "b", "c"]) await q.add(id);

    await q.core.drain({ afterPass });

    const reported = afterPass.mock.calls.map(([s]) => s.succeeded);
    // every upload is reported exactly once...
    expect(reported.reduce((a, b) => a + b, 0)).toBe(3);
    // ...in reports of at least a slot's worth, bar the last
    for (const n of reported.slice(0, -1)) expect(n).toBeGreaterThanOrEqual(2);
  });

  it("refills a slot as soon as it frees, without waiting for the slowest", async () => {
    const order: string[] = [];
    let releaseSlow: () => void = () => {};
    const q = createQueueDriver({
      concurrency: 2,
      // slow hangs until released; the rest finish straight away
      upload: async (p: TestPayload) => {
        if (p.id !== "slow") {
          order.push(p.id);
          return uploaded("done");
        }
        await new Promise<void>((resolve) => {
          releaseSlow = resolve;
        });
        order.push("slow");
        return uploaded("done");
      },
    });
    for (const id of ["slow", "b", "c", "d"]) await q.add(id);

    const draining = q.core.drain();
    // b, c and d should all go through the other slot while slow is stuck
    for (let i = 0; i < 100 && order.length < 3; i++) {
      await new Promise((r) => setTimeout(r, 0));
    }
    releaseSlow();
    const summary = unwrap(await draining);

    expect(order).toEqual(["b", "c", "d", "slow"]);
    expect(summary.succeeded).toBe(4);
  });

  it("doesn't let a permanent failure stop the others", async () => {
    const q = createQueueDriver({ concurrency: 1 });
    for (const id of ["gone", "b"]) await q.add(id);
    q.uploader.respondWith(permanentFail(), uploaded("done"));

    const summary = unwrap(await q.core.drain());

    expect(summary.died).toBe(1);
    expect(summary.succeeded).toBe(1);
  });

  it("skips an entry removed after it was read", async () => {
    const q = createQueueDriver({ concurrency: 1 });
    for (const id of ["a", "b", "c"]) await q.add(id);

    await q.core.drain({
      afterPass: async () => {
        await q.core.remove("c");
      },
    });

    expect(q.uploader.calls().map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("picks up entries queued while it runs", async () => {
    const q = createQueueDriver({ concurrency: 1 });
    await q.add("a");
    let added = false;

    await q.core.drain({
      afterPass: async () => {
        if (added) return;
        added = true;
        await q.core.enqueue(payload("late"));
      },
    });

    expect(q.uploader.calls().map((p) => p.id)).toEqual(["a", "late"]);
  });
});
