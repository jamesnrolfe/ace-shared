import { createCacheDriver } from "./cacheDriver";

describe("ensure", () => {
  it("downloads and persists a new entry", async () => {
    const d = createCacheDriver();
    const result = await d.ensure("things", "a");
    expect(result).toEqual({
      ok: true,
      value: { id: "a", localUri: "fake://things/a.bin" },
    });
    expect(d.storedIds("things")).toEqual(["a"]);
  });

  it("does not redownload when already cached", async () => {
    const d = createCacheDriver();

    await d.ensure("things", "a");
    await d.ensure("things", "a");

    expect(d.fileStorage.downloadCalls()).toHaveLength(1);
  });

  it("re-downloads when forced", async () => {
    const d = createCacheDriver();

    await d.ensure("things", "a");
    await d.ensure("things", "a", { forceReDownload: true });

    expect(d.fileStorage.downloadCalls()).toHaveLength(2);
  });

  it("shares one in-flight download between concurrent callers", async () => {
    const d = createCacheDriver();

    const [first, second] = await Promise.all([
      d.ensure("things", "a"),
      d.ensure("things", "a"),
    ]);

    expect(first).toEqual(second);
    expect(d.fileStorage.downloadCalls()).toHaveLength(1);
  });

  it("tries sources in order until one succeeds", async () => {
    const d = createCacheDriver({
      areas: [
        {
          area: "things",
          schemaVersion: 1,
          priority: 10,
          ttlMs: null,
          fileNameGenerator: (id) => `${id}.bin`,
          sources: [
            (id) => `https://low/${id}`,
            (_id, hint) => hint ?? null,
            (id) => `https://full/${id}`,
          ],
        },
      ],
    });
    d.fileStorage.respondTo("https://low/a", null);

    const result = await d.ensure("things", "a", { urlHint: "https://hint/a" });

    expect(result.ok).toBe(true);
    expect(d.fileStorage.downloadCalls()).toEqual([
      "https://low/a",
      "https://hint/a",
    ]);
  });

  it("skips a source that does not apply, without calling download for it", async () => {
    const d = createCacheDriver({
      areas: [
        {
          area: "things",
          schemaVersion: 1,
          priority: 10,
          ttlMs: null,
          fileNameGenerator: (id) => `${id}.bin`,
          sources: [(_id, hint) => hint ?? null, (id) => `https://full/${id}`],
        },
      ],
    });

    await d.ensure("things", "a"); // no urlHint given

    expect(d.fileStorage.downloadCalls()).toEqual(["https://full/a"]);
  });

  it("fails when every source is exhausted", async () => {
    const d = createCacheDriver();
    d.fileStorage.respondTo("https://example.test/a", null);

    const result = await d.ensure("things", "a");

    expect(result).toEqual({
      ok: false,
      error: { message: 'No source produced a download for "things:a"' },
    });
    expect(d.storedIds("things")).toEqual([]);
  });

  it("fails for a area that isn't configured", async () => {
    const d = createCacheDriver();

    const result = await d.pool.ensure({
      area: "nope",
      id: "a",
      workObjectId: null,
    });

    expect(result).toEqual({
      ok: false,
      error: { message: 'Unknown cache area "nope".' },
    });
  });

  it("records the work object an entry belongs to", async () => {
    const d = createCacheDriver();

    await d.ensure("things", "a", { workObjectId: "wo-1" });

    expect(d.entry("things", "a")?.workObjectId).toBe("wo-1");
  });

  it("reports failure when the index write fails - though the file itself is left on disk", async () => {
    const d = createCacheDriver();
    d.storage.failWrites(1, "disk full");

    const result = await d.ensure("things", "a");

    expect(result).toEqual({ ok: false, error: { message: "disk full" } });
    expect(d.storedIds("things")).toEqual([]);
    // known gap: the download already succeeded before the index write
    // failed, so this file is now orphaned - untracked by budget/TTL/
    // reconcile eviction until something re-downloads (and re-indexes) "a".
    expect(d.fileStorage.dump()).toEqual({ "things/a.bin": 1024 });
  });

  it("does not leave a stale in-memory entry after a failed index write", async () => {
    const d = createCacheDriver();
    d.storage.failWrites(1, "disk full");

    await d.ensure("things", "a");
    // the write() above failed, so nothing should be findable in the index -
    // in particular, a later ensure() for the same id must not treat this as
    // "already cached with old metadata" (this is the bug write()'s
    // persist-before-mirror ordering fixes).
    expect(d.entry("things", "a")).toBeUndefined();

    // known gap, distinct from the above: because the file is already on
    // disk from the first attempt, this second call takes the cache-hit
    // path and returns ok() without ever calling write() again - so the
    // entry stays un-indexed rather than self-healing. Recovering it needs
    // forceReDownload: true, or a manual remove() first.
    const second = await d.ensure("things", "a", { workObjectId: "wo-1" });

    expect(second.ok).toBe(true);
    expect(d.entry("things", "a")).toBeUndefined();
  });
});
