import type { Result } from "../../ts-utils/src/index";
import { CacheFile } from "./storage";

/**
 * Resolves a remote source url for `id`, or `null` if this source does not
 * apply to this request.
 *
 * `urlHint` is whatever the caller passed through on the request (e.g.
 * a presigned URL it already had on hand) - a resolver that doesn't need
 * it can ignore the second argument entirely.
 */
export type SourceResolver = (id: string, urlHint?: string) => string | null;

/**
 * Persisted metadata for one cached file.
 */
export interface CacheEntry {
  readonly id: string;
  readonly area: string;
  /**
   * The work object this entry belongs to, or `null` if it isn't tied to
   * one.
   *
   * Entries with a `workObjectId` are deleted the moment that id stops
   * appearing in a call to {@link CachePool.reconcileWorkObjects}.
   *
   * Entries with `null` are never touched (assumed to be unrelated to workObjects).
   * These rely solely on TTL and budget eviction.
   */
  readonly workObjectId: string | null;
  readonly sizeBytes: number;
  readonly downloadedAt: string;
  readonly lastAccessedAt: string;
  readonly schemaVersion: number;
}

export interface CacheError {
  readonly message: string;
}

export type CacheResult<T> = Result<T, CacheError>;

export interface CachedFile {
  readonly id: string;
  readonly localUri: string;
}

/** Per-kind tuning - one CacheDirConfig maps to one on-disk subdir e.g. 'drawings' */
export interface CacheAreaConfig {
  readonly area: string;
  readonly schemaVersion: number;
  /**
   * This dirs priority within the shared byte budget. When the pool is over
   * budget, entries belonging to the lowest-priority are evicted first;
   * within a kind, least-recently used entries go first. Kinds with
   * equal priority are evicted together, purely by recency.
   */
  readonly priority: number;
  /**
   * Entires older than this (measured from `lastAccessedAt`) are evicted
   * regarless of budget pressure. `null` means this kind has no TTL
   * eviction.
   */
  readonly ttlMs: number | null;
  /** Tried in order until one resolves to a URL and that URL downloads succesfully. */
  readonly sources: ReadonlyArray<SourceResolver>;
  /** On-disk file name for `id` e.g. `(id) => ${id}.jpg`*/
  readonly fileNameGenerator: (id: string) => string;
  /**
   * Runs once, right after a successful download and before the entry is
   * indexed - a change to replace the downloaded file in place (e.g.
   * transcoding to a smaller format) before its final size is computed.
   *
   * Must leave a valid file at `file.uri` when it resolves.
   */
  readonly postDownloadTransform?: (file: CacheFile) => Promise<void>;
}

export interface EnsureRequest {
  readonly area: string;
  readonly id: string;
  /**
   * The work object this entry belongs to. Pass `null` only for content
   * that genuinely isn't scoped to one work object -> everything else
   * must pass a real id, or it will never be cleaned up via
   * reconciliation. In this case, ensure that you have supplied
   * reasonably TTL / byte-budget parameters so that this stuff is
   * appropriately cleared and doesn't stick around forever.
   */
  readonly workObjectId: string | null;
  /**
   * Passed through verbatim to every {@link SourceResolver} in this dirs
   * `sources` list.
   */
  readonly urlHint?: string;
  /**
   * A per-call content fetcher, for sources that need caller-side context
   * e.g. an auth token. When present, its tried before `sources`/`urlHint`.
   * If it resolves, the pool writes the content straight to disk via
   * {@link CacheFileStorage.write} instead of downloading a URL.
   */
  readonly fetch?: () => Promise<CacheResult<string>>;
  readonly forceReDownload?: boolean;
}

export interface EvictionSummary {
  /** Deleted because their work object was absent from a reconciliation call. */
  readonly reconciled: number;
  /** Deleted for exceeding their kind's TTL. */
  readonly evictedForTtl: number;
  /** Deleted to bring the pool back under its shared byte budget. */
  readonly evictedForBudget: number;
  readonly bytesFreed: number;
}

export interface CachePoolConfig {
  readonly areas: ReadonlyArray<CacheAreaConfig>;
  /**
   * Total bytes every dir in `dirs` shares. Exceeding it triggers priority + LRU eviction
   * across all dirs.
   */
  readonly totalBudgetBytes: number;
}
