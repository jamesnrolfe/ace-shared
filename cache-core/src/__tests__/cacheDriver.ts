import { CachePool, createCachePool } from "../pool";
import { CacheEntry, CachePoolConfig, EnsureRequest } from "../types";
import {
  FakeClock,
  FakeFileStore,
  fakeClock,
  fakeFileStore,
  MemoryIndexStorage,
  memoryIndexStorage,
  testConfig,
} from "./cacheFactory";

export interface CacheDriver {
  pool: CachePool;
  storage: MemoryIndexStorage;
  fileStorage: FakeFileStore;
  clock: FakeClock;

  hydrate(): Promise<void>;
  /** ensure() with a sane default (`workObjectId: null`) - override only what a test is about. */
  ensure: (
    area: string,
    id: string,
    overrides?: Partial<Omit<EnsureRequest, "area" | "id">>,
  ) => ReturnType<CachePool["ensure"]>;
  advance(ms: number): void;
  entries(area?: string): ReadonlyArray<CacheEntry>;
  entry(area: string, id: string): CacheEntry | undefined;
  /** Ids actually persisted, for asserting durability rather than in-memory state. */
  storedIds(area?: string): string[];
}

export function createCacheDriver(
  overrides: Partial<CachePoolConfig> = {},
  seed: Record<string, string> = {},
): CacheDriver {
  const storage = memoryIndexStorage(seed);
  const clock = fakeClock();
  const fileStorage = fakeFileStore();

  const config = testConfig(overrides);
  const pool = createCachePool(config, {
    indexStorage: storage,
    fileStorage,
    clock: clock.now,
    namespace: "u1",
  });

  return {
    pool,
    storage,
    fileStorage,
    clock,
    hydrate: () => pool.hydrate(),
    ensure: (area, id, over = {}) =>
      pool.ensure({ area, id, workObjectId: null, ...over }),
    advance: (ms) => clock.advance(ms),
    entries: (area) => pool.list(area),
    entry: (area, id) => pool.list(area).find((e) => e.id === id),
    storedIds: (area) =>
      Object.keys(storage.dump())
        .filter((k) => k.startsWith(area ? `CACHE:u1:${area}:` : "CACHE:u1:"))
        .map((k) => k.replace(/^CACHE:u1:[^:]+:/, "")),
  };
}
