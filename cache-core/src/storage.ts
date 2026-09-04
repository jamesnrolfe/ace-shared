/**
 * The index persistence surface the pool needs, as a port.
 *
 * You will note that this is identical to `upload-queue`'s
 * `QueueStorage`, so existing adapters can be passed
 * unmodified.
 */
export interface CacheIndexStorage {
  keys(prefix: string): Promise<readonly string[]>;
  getMany(
    keys: readonly string[],
  ): Promise<ReadonlyArray<readonly [string, string | null]>>;
  set(key: string, value: string): Promise<void>;
  setMany(pairs: ReadonlyArray<readonly [string, string]>): Promise<void>;
  remove(keys: readonly string[]): Promise<void>;
}

/**
 * A handle to one cached blob on disk.
 *
 * Recommended to use `expo-file-system`'s `File` as the adaptor,
 * since this mirrors the properties seen there.
 */
export interface CacheFile {
  readonly uri: string;
  readonly exists: boolean;
  /** 0 if file does not exist */
  readonly sizeBytes: number;
  delete(): void;
}

/** The blob storage surface the pool needs, as a port. */
export interface CacheFileStorage {
  /** A handle for `area`/`fileName`, without touching disk. */
  file(area: string, fileName: string): CacheFile;
  /** Ensures `area`'s directory exists. Safe to call repeatedly. */
  ensureDir(area: string): void;
  /**
   * Downloads `url` into `area`'s directory as `fileName`, atomically.
   *
   * The implementation should write to a temp location first, and only
   * replace the final path once the download has succeeded, so a killed
   * process never leaves partially written files.
   *
   * @returns the downloaded size in bytes, or `null` if the download failed.
   */
  download(area: string, fileName: string, url: string): Promise<number | null>;
  /**
   * Writes `content` into `area`'s directory as `fileName`, atomically.
   *
   * The implementation should write to a temp location first, and only
   * replace the final path once the write has succeeded, so a killed
   * process never leaves partially written files.
   *
   * @returns the written size in bytes, or `null` if the write failed.
   */
  write(area: string, fileName: string, url: string): Promise<number | null>;
}

/** ms since epoch. For testing. */
export type Clock = () => number;
