import type {
  CacheFile,
  CacheFileStorage,
  CacheIndexStorage,
  Clock,
} from "../storage";
import type { CacheAreaConfig, CacheEntry, CachePoolConfig } from "../types";

export interface MemoryIndexStorage extends CacheIndexStorage {
  /** Raw view of whats on "disk", for asserting persistence directly. */
  dump(): Record<string, string>;
  /** Makes the next `n` writes reject, to exercise the write-failure path. */
  failWrites(n: number, message?: string): void;
}

export function memoryIndexStorage(
  seed: Record<string, string> = {},
): MemoryIndexStorage {
  const data = new Map<string, string>(Object.entries(seed));
  let failures = 0;
  let failMessage = "storage full";

  const guard = async () => {
    if (failures > 0) {
      failures--;
      throw new Error(failMessage);
    }
  };

  return {
    async keys(prefix) {
      return [...data.keys()].filter((k) => k.startsWith(prefix));
    },
    async getMany(keys) {
      return keys.map((k) => [k, data.get(k) ?? null] as const);
    },
    async set(key, value) {
      await guard();
      data.set(key, value);
    },
    async setMany(pairs) {
      await guard();
      for (const [k, v] of pairs) data.set(k, v);
    },
    async remove(keys) {
      for (const k of keys) data.delete(k);
    },
    dump: () => Object.fromEntries(data),
    failWrites: (n, message = "storage full") => {
      failures = n;
      failMessage = message;
    },
  };
}

export interface FakeFileStore extends CacheFileStorage {
  /** Script the response for the next `download()` call to this exact url. `null` fails it. */
  respondTo(url: string, outcome: number | null): void;
  /** Every url `download()` was called with, in call order. */
  downloadCalls(): readonly string[];
  /** Seeds a file directly onto the fake disk, without going through download(). */
  seedFile(area: string, fileName: string, sizeBytes: number): void;
  /** Raw view of what's "on disk": `${area}/${fileName}` -> size. */
  dump(): Record<string, number>;
}

export function fakeFileStore(): FakeFileStore {
  const disk = new Map<string, number>();
  const scripted = new Map<string, number | null>();
  const calls: string[] = [];
  const key = (area: string, fileName: string) => `${area}/${fileName}`;

  const handle = (area: string, fileName: string): CacheFile => {
    const k = key(area, fileName);
    return {
      get uri() {
        return `fake://${k}`;
      },
      get exists() {
        return disk.has(k);
      },
      get sizeBytes() {
        return disk.get(k) ?? 0;
      },
      delete() {
        disk.delete(k);
      },
    };
  };

  return {
    file: handle,
    ensureDir() {},
    async download(area, fileName, url) {
      calls.push(url);
      const scriptedBytes = scripted.get(url);
      const bytes = scriptedBytes === undefined ? 1024 : scriptedBytes;
      if (bytes === null) return null;
      disk.set(key(area, fileName), bytes);
      return bytes;
    },
    respondTo(url, outcome) {
      scripted.set(url, outcome);
    },
    downloadCalls: () => calls,
    seedFile(area, fileName, sizeBytes) {
      disk.set(key(area, fileName), sizeBytes);
    },
    dump: () => Object.fromEntries(disk),
  };
}

export interface FakeClock {
  now: Clock;
  advance(ms: number): void;
  set(ms: number): void;
}

export function fakeClock(
  start = Date.parse("2026-01-01T00:00:00.000Z"),
): FakeClock {
  let t = start;
  return {
    now: () => t,
    advance: (ms) => {
      t += ms;
    },
    set: (ms) => {
      t = ms;
    },
  };
}

/** A single-area config with sane test defaults; override only what a test is about. */
export function testArea(
  overrides: Partial<CacheAreaConfig> = {},
): CacheAreaConfig {
  return {
    area: "things",
    schemaVersion: 1,
    priority: 10,
    ttlMs: null,
    fileNameGenerator: (id) => `${id}.bin`,
    sources: [(id) => `https://example.test/${id}`],
    ...overrides,
  };
}

export function testConfig(
  overrides: Partial<CachePoolConfig> = {},
): CachePoolConfig {
  return {
    areas: [testArea()],
    totalBudgetBytes: 1_000_000,
    ...overrides,
  };
}

/**
 * A persisted entry as a `[key, value]` pair, for seeding storage.
 *
 * Lets a test start from index state the pool can reach but would be
 * tedious to drive to - a specific lastAccessedAt, a stale schema version,
 * an entry owned by a work object.
 */
export function storedEntry(
  area: string,
  id: string,
  over: Partial<CacheEntry> = {},
): [string, string] {
  const at = "2026-01-01T00:00:00.000Z";
  const entry: CacheEntry = {
    id,
    area,
    workObjectId: null,
    sizeBytes: 1024,
    downloadedAt: at,
    lastAccessedAt: at,
    schemaVersion: 1,
    ...over,
  };
  return [`CACHE:u1:${area}:${id}`, JSON.stringify(entry)];
}
