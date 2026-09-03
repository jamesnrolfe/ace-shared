import { err, ok } from "../../ts-utils/src/index";
import {
  getEntriesToEvictBudgetPressure,
  getEntriesToEvictTTL,
  getEntriesToReconcile,
} from "./budget";
import { CacheFileStorage, CacheIndexStorage, Clock } from "./storage";
import {
  CacheAreaConfig,
  CachedFile,
  CacheEntry,
  CachePoolConfig,
  CacheResult,
  EnsureRequest,
  EvictionSummary,
} from "./types";

export interface CachePool {
  /**
   * Returns the cached local file for `request`, downloading it first if
   * needed.
   *
   * Concurrent calls for the same namespace/id share one in-flight download.
   *
   * Records the access for LRU purposes.
   *
   * @returns the (possibly newly) cached file, or an error if the download
   * failed
   */
  ensure(request: EnsureRequest): Promise<CacheResult<CachedFile>>;
  /**
   * Synchronous lookup: the cached file if present on disk, else `null`.
   *
   * Never downloads (see {@link CachePool.ensure} if this is desired).
   *
   * Records the access for LRU purposes on a hit.
   *
   * @returns the cached file if found, else `null`
   */
  getCachedFile(namespace: string, id: string): CachedFile | null;
  /**
   * Remove a file from storage under namespace/id.
   */
  remove(namespace: string, id: string): Promise<void>;
  /**
   * Every currently known entry.
   *
   * Pass `namespace` to filter the list to just said namespace.
   *
   * This is synchonous - served from index, not directory itself.
   *
   * @returns list of all cached entries
   */
  list(namespace?: string): ReadonlyArray<CacheEntry>;
  /**
   * Get the size of the cache.
   *
   * Pass `namespace` to filter the output to just said namespace.
   *
   * @returns size in bytes
   */
  getSizeBytes(namespace?: string): number;
  /**
   * Delete every entry.
   *
   * Pass `namespace` to clear only the said namespace.
   */
  clear(namespace?: string): Promise<void>;
  /**
   * Delete's every entry whose `workObjectId` is set but absent from
   * `validWorkObjects`.
   *
   * Call this when work objects are reloaded to ensure useless items
   * are removed from the cache regularly.
   *
   * @returns an {@link EvictionSummary} type, for logging.
   */
  reconcileWorkObjects(
    validWorkObjectIds: ReadonlySet<string>,
  ): Promise<EvictionSummary>;
  /**
   * Evicts TTL-expired entries, then - if the pool is still over budget,
   * the lowest-priority, least-recently-used entries until it is back
   * under the shared budget.
   *
   * Cheap to call frequently - a no-op when nothing is due.
   *
   * @returns an {@link EvictionSummary} type, for logging.
   */
  runEviction(): Promise<EvictionSummary>;
  /**
   * Populates the in-memory index from storage. Must resolve before other
   * calls will see state persisted by a previous session.
   */
  hydrate(): Promise<void>;
}

export interface CachePoolDeps {
  readonly indexStorage: CacheIndexStorage;
  readonly fileStorage: CacheFileStorage;
  readonly clock: Clock;
  /** Scopes keys to one user, so a second sign-in cannot see the first's cache. */
  readonly namespace: string;
}

const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function createCachePool(
  config: CachePoolConfig,
  deps: CachePoolDeps,
): CachePool {
  const { areas, totalBudgetBytes } = config;
  const { indexStorage, fileStorage, clock, namespace } = deps;

  const configByArea = new Map<string, CacheAreaConfig>(
    areas.map((a) => [a.area, a]),
  );
  const priorityByArea = new Map(areas.map((a) => [a.area, a.priority]));
  const ttlMsByArea = new Map(areas.map((a) => [a.area, a.ttlMs]));

  const prefix = `CACHE:${namespace}:`;
  const keyFor = (area: string, id: string) => `${prefix}${area}:${id}`;
  const iso = (ms: number) => new Date(ms).toISOString();

  // in memory mirror so getCachedFile/list/getSizeBytes stay synchronous.
  // The backing index storage is not. Written through on every mutation,
  // so it never drifts from whats persisted
  const index = new Map<string, CacheEntry>();

  // dedupes concurrent ensure() calls for the smae area/id so two callers
  // racing on one drawing do not fire duplicate downloads.
  const inFlight = new Map<string, Promise<CacheResult<CachedFile>>>();

  // write to in-memory and db index
  const write = async (entry: CacheEntry): Promise<void> => {
    // persist before the memory mirror: a failed persisted write never leaves the in-memory
    // index out of sync with what's actually on the disk
    await indexStorage.set(keyFor(entry.area, entry.id), JSON.stringify(entry));
    index.set(keyFor(entry.area, entry.id), entry);
  };

  // drop from in memory and db index, as well as deleting the file if
  // it exists. Same ordering concern as write(): persist the removal
  // before dropping the in-memory entry, so a failed indexStorage.remove()
  // leaves the entry findable (and counted in getSizeBytes()) rather than
  // silently forgotten for the rest of this session while it still sits on
  // disk and in persisted storage.
  const drop = async (entry: CacheEntry): Promise<void> => {
    await indexStorage.remove([keyFor(entry.area, entry.id)]);
    index.delete(keyFor(entry.area, entry.id));
    const areaConfig = configByArea.get(entry.area);
    if (!areaConfig) return;
    fileStorage
      .file(entry.area, areaConfig.fileNameGenerator(entry.id))
      .delete();
  };

  async function hydrate(): Promise<void> {
    const keys = await indexStorage.keys(prefix);
    const stored = await indexStorage.getMany(keys);
    for (const [key, raw] of stored) {
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as CacheEntry;
        const areaConfig = configByArea.get(parsed.area);
        // drop entries for an area this build no longer supports
        // or whose schema has moved on
        if (!areaConfig || parsed.schemaVersion !== areaConfig.schemaVersion) {
          await indexStorage.remove([key]);
          continue;
        }
        index.set(key, parsed);
      } catch {
        await indexStorage.remove([key]);
      }
    }
  }

  function list(area?: string): ReadonlyArray<CacheEntry> {
    const all = [...index.values()];
    return area ? all.filter((e) => e.area === area) : all;
  }

  function getSizeBytes(area?: string): number {
    return list(area).reduce((sum, e) => sum + e.sizeBytes, 0);
  }

  // update the lastAccessedAt to now
  function touch(entry: CacheEntry): void {
    const updated: CacheEntry = { ...entry, lastAccessedAt: iso(clock()) };
    index.set(keyFor(entry.area, entry.id), updated);
    // f&f: lost access-time update costs a slightly stale LRU ordering,
    // not correctness - not worth making every cache it await a storage write
    void indexStorage.set(
      keyFor(entry.area, entry.id),
      JSON.stringify(updated),
    );
  }

  function getCachedFile(area: string, id: string): CachedFile | null {
    const areaConfig = configByArea.get(area);
    if (!areaConfig) return null;

    const file = fileStorage.file(area, areaConfig.fileNameGenerator(id));
    if (!file.exists) return null;

    const entry = index.get(keyFor(area, id));
    if (entry) {
      touch(entry); // update lastAccessedAt
    } else {
      // Self-heal, same reasoning as ensure()'s fast path above. This is a
      // read-only lookup with no request to draw a workObjectId from, so
      // the recovered entry is untied from any work object - it will only
      // be cleaned up by TTL/budget eviction, not reconciliation. Still
      // strictly better than staying permanently uncounted.
      const now = iso(clock());
      void write({
        id,
        area,
        workObjectId: null,
        sizeBytes: file.sizeBytes,
        downloadedAt: now,
        lastAccessedAt: now,
        schemaVersion: areaConfig.schemaVersion,
      });
    }

    return { id, localUri: file.uri };
  }

  async function ensure(
    request: EnsureRequest,
  ): Promise<CacheResult<CachedFile>> {
    const {
      area,
      id,
      workObjectId,
      urlHint,
      forceReDownload = false,
    } = request;
    const areaConfig = configByArea.get(area);
    if (!areaConfig) return err({ message: `Unknown cache area "${area}".` });

    const dedupeKey = keyFor(area, id);
    if (!forceReDownload) {
      const pending = inFlight.get(dedupeKey);
      if (pending) return pending;
    }

    const promise: Promise<CacheResult<CachedFile>> = (async () => {
      try {
        fileStorage.ensureDir(area);
        const fileName = areaConfig.fileNameGenerator(id);
        const dest = fileStorage.file(area, fileName);

        if (!forceReDownload && dest.exists) {
          // if we are not force redownloading, and the file already exists,
          // then we can just return that
          const existing = index.get(dedupeKey);
          if (existing) {
            touch(existing);
          } else {
            // Self-heal: the file is on disk but was never indexed - e.g.
            // a previous attempt downloaded it successfully but never
            // completed write() (interrupted, crashed, or reloaded mid
            // chain). Without this, the entry is stuck outside the byte
            // budget and reconciliation forever: visible and usable, but
            // permanently uncounted and unevictable.
            const now = iso(clock());
            await write({
              id,
              area,
              workObjectId,
              sizeBytes: dest.sizeBytes,
              downloadedAt: now,
              lastAccessedAt: now,
              schemaVersion: areaConfig.schemaVersion,
            });
          }
          return ok({ id, localUri: dest.uri });
        }

        let downloadedBytes: number | null = null;
        for (const source of areaConfig.sources) {
          const url = source(id, urlHint);
          if (!url) continue;
          downloadedBytes = await fileStorage.download(area, fileName, url);
          if (downloadedBytes !== null) break; // end on success
        }

        // no source succeeded
        if (downloadedBytes === null) {
          return err({
            message: `No source produced a download for "${area}:${id}"`,
          });
        }

        if (areaConfig.postDownloadTransform) {
          await areaConfig.postDownloadTransform(dest);
          downloadedBytes = dest.sizeBytes;
        }

        const now = iso(clock());
        await write({
          id,
          area,
          workObjectId,
          sizeBytes: downloadedBytes,
          downloadedAt: now,
          lastAccessedAt: now,
          schemaVersion: areaConfig.schemaVersion,
        });

        return ok({ id, localUri: dest.uri });
      } catch (e) {
        return err({ message: reason(e) });
      }
    })();

    if (!forceReDownload) {
      inFlight.set(dedupeKey, promise);
      void promise.finally(() => inFlight.delete(dedupeKey));
    }

    return promise;
  }

  async function remove(area: string, id: string): Promise<void> {
    const entry = index.get(keyFor(area, id));
    if (entry) {
      await drop(entry);
      return;
    }
    // no index entry e.g. hydrate() hasn't resolved yet
    // Still try to remove the file so a stale blob is gone
    const areaConfig = configByArea.get(area);
    if (areaConfig)
      fileStorage.file(area, areaConfig.fileNameGenerator(id)).delete();
  }

  async function clear(area?: string): Promise<void> {
    for (const entry of list(area)) await drop(entry);
  }

  async function reconcileWorkObjects(
    validWorkObjectIds: ReadonlySet<string>,
  ): Promise<EvictionSummary> {
    const toDelete = getEntriesToReconcile(list(), validWorkObjectIds);
    let bytesFreed = 0;
    for (const entry of toDelete) {
      bytesFreed += entry.sizeBytes;
      await drop(entry);
    }
    return {
      reconciled: toDelete.length,
      evictedForTtl: 0,
      evictedForBudget: 0,
      bytesFreed,
    };
  }

  async function runEviction(): Promise<EvictionSummary> {
    const now = clock();

    const ttlDue = getEntriesToEvictTTL(list(), ttlMsByArea, now);
    let bytesFreed = 0;
    for (const entry of ttlDue) {
      bytesFreed += entry.sizeBytes;
      await drop(entry);
    }

    const budgetDue = getEntriesToEvictBudgetPressure(
      list(),
      priorityByArea,
      totalBudgetBytes,
    );
    for (const entry of budgetDue) {
      bytesFreed += entry.sizeBytes;
      await drop(entry);
    }

    return {
      reconciled: 0,
      evictedForTtl: ttlDue.length,
      evictedForBudget: budgetDue.length,
      bytesFreed,
    };
  }

  return {
    ensure,
    getCachedFile,
    remove,
    list,
    getSizeBytes,
    clear,
    reconcileWorkObjects,
    runEviction,
    hydrate,
  };
}
