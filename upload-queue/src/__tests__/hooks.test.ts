import { ok } from "../../../ts-utils/src";
import type { UploadContext, UploadResult } from "../types";
import { createQueueDriver } from "./queueDriver";
import { retryableFail, type TestPayload } from "./queueFactory";

describe("dynamic concurrency", () => {
  it("asks for the limit afresh on every pass", async () => {
    let limit = 1;
    const q = createQueueDriver({ concurrency: () => limit });
    await q.add("a");
    await q.add("b");
    await q.add("c");

    await q.run();
    expect(q.uploader.calls()).toHaveLength(1);

    limit = 2;
    await q.run();
    expect(q.uploader.calls()).toHaveLength(3);
  });

  it("accepts an async limit", async () => {
    const q = createQueueDriver({ concurrency: async () => 3 });
    for (const id of ["a", "b", "c", "d"]) await q.add(id);

    const summary = await q.run();

    expect(summary.claimed).toBe(3);
  });
});

describe("prepare", () => {
  it("receives every claimed payload once, before any upload", async () => {
    const order: string[] = [];
    const q = createQueueDriver({
      concurrency: 2,
      prepare: async (payloads) => {
        order.push(`prepare:${payloads.map((p) => p.id).join(",")}`);
      },
      upload: async (p) => {
        order.push(`upload:${p.id}`);
        return ok("done");
      },
    });
    await q.add("a");
    await q.add("b");
    await q.add("c");

    await q.run();

    expect(order).toEqual(["prepare:a,b", "upload:a", "upload:b"]);
  });

  it("is skipped when nothing was claimed", async () => {
    const prepare = jest.fn(async () => {});
    const q = createQueueDriver({ prepare });

    await q.run();

    expect(prepare).not.toHaveBeenCalled();
  });

  it("does not stop uploads when it throws", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const q = createQueueDriver({
      prepare: async () => {
        throw new Error("token service down");
      },
    });
    await q.add("a");

    const summary = await q.run();

    expect(summary.succeeded).toBe(1);
    warn.mockRestore();
  });
});

/** Lets the pass get as far as its (held) uploads. */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("lease extension", () => {
  /** An upload that holds until released, exposing its context. */
  function heldUpload() {
    let release: (fail: boolean) => void = () => {};
    let context: UploadContext | null = null;
    const upload = (_p: TestPayload, ctx: UploadContext) => {
      context = ctx;
      return new Promise<UploadResult<string>>((resolve) => {
        release = (fail) => resolve(fail ? retryableFail() : ok("done"));
      });
    };
    return {
      upload,
      context: () => context as UploadContext | null,
      release: (fail = false) => release(fail),
    };
  }

  it("pushes the lease out from the current time", async () => {
    const held = heldUpload();
    const q = createQueueDriver({ leaseMs: 30_000, upload: held.upload });
    await q.add("a");

    const pass = q.run();
    await flush();
    q.advance(20_000);
    await held.context()?.extendLease();

    expect((await q.entry("a"))?.leaseExpiresAt).toBe(
      new Date(q.clock.now() + 30_000).toISOString(),
    );

    held.release();
    await pass;
  });

  it("keeps a progressing upload from being reclaimed by another pass", async () => {
    const held = heldUpload();
    const q = createQueueDriver({ leaseMs: 30_000, upload: held.upload });
    await q.add("a");

    const pass = q.run();
    await flush();
    q.advance(25_000);
    await held.context()?.extendLease();
    q.advance(25_000); // past the original lease, inside the extended one

    const second = await q.core.runOnce();
    expect(second.ok && second.value.reclaimed).toBe(0);

    held.release();
    await pass;
  });

  it("cannot resurrect an entry once its upload has succeeded", async () => {
    const held = heldUpload();
    const q = createQueueDriver({ upload: held.upload });
    await q.add("a");

    const pass = q.run();
    await flush();
    const context = held.context();
    held.release();
    await pass;
    await context?.extendLease();

    expect(q.storedIds()).toEqual([]);
  });

  it("does not re-create an entry removed mid-upload", async () => {
    const held = heldUpload();
    const q = createQueueDriver({ upload: held.upload });
    await q.add("a");

    const pass = q.run();
    await flush();
    await q.core.remove("a");
    await held.context()?.extendLease();

    expect(q.storedIds()).toEqual([]);

    held.release(true);
    await pass;
  });
});
