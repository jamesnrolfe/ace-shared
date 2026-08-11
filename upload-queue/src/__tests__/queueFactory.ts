import { Err, err, ok } from "../../../ts-utils/src";
import { Clock, QueueStorage } from "../storage";
import { QueueConfig, QueueEntry, QueueError, UploadResult } from "../types";

/** A payload with nothing in it but an ID, for tests that dont give a shit */
export interface TestPayload {
  readonly id: string;
  readonly label?: string;
}

export const payload = (id: string, label?: string): TestPayload => ({
  id,
  label,
});

export interface MemoryStorage extends QueueStorage {
  /** Raw view of whats on "disk", for asserting persistence directly. */
  dump(): Record<string, string>;
  /** Makes the next `n` writes reject, to exercise the NOT_QUEUED path. */
  failWrites(n: number, message?: string): void;
  /** Overwwrite a key with arbitrary text, to simulate corruption. */
  corruptKey(key: string, value: string): void;
}

export function memoryStorage(
  seed: Record<string, string> = {},
): MemoryStorage {
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
    corruptKey: (key, value) => data.set(key, value),
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

export const uploaded = <T>(value: T): UploadResult<T> => ok(value);

export const retryableFail = (message = "network down"): Err<QueueError> =>
  err({ message, retryable: true });

export const permanentFail = (
  message = "invalid params",
  code = "INVALID_PARAMS",
): Err<QueueError> => err({ message, code, retryable: false });

export interface FakeUploader<T> {
  upload: (payload: TestPayload) => Promise<UploadResult<T>>;
  /** Queue one response per call - last one repeats once exhausted. */
  respondWith(...results: UploadResult<T>[]): void;
  /** Payloads seen, in call order. */
  calls(): readonly TestPayload[];
  /** Highest number of uploads in flight at once. */
  peakConcurrency(): number;
}

export function fakeUploader<T = string>(
  initial: UploadResult<T> = ok("done" as unknown as T),
): FakeUploader<T> {
  let scripted: UploadResult<T>[] = [];
  let fallback = initial;
  const seen: TestPayload[] = [];
  let live = 0;
  let peak = 0;

  return {
    async upload(p) {
      seen.push(p);
      live++;
      peak = Math.max(peak, live);
      // yield once so genuine parallel calls overlap and peak is meaningful
      await Promise.resolve();
      live--;
      return scripted.length > 0
        ? (scripted.shift() as UploadResult<T>)
        : fallback;
    },
    respondWith(...results) {
      scripted = [...results];
      if (results.length > 0) fallback = results[results.length - 1];
    },
    calls: () => seen,
    peakConcurrency: () => peak,
  };
}

/** A queue config with sane test defaults; override only what a test is about. */
export function testConfig<T = string>(
  overrides: Partial<QueueConfig<TestPayload, T>> = {},
): QueueConfig<TestPayload, T> {
  return {
    name: "test",
    schemaVersion: 1,
    getId: (p) => p.id,
    concurrency: 2,
    maxAttempts: 3,
    leaseMs: 30_000,
    backoffMs: () => 10_000,
    upload: async () => ok("done" as unknown as T),
    ...overrides,
  };
}

/**
 * A persisted entry as a `[key, value]` pair, for seeding storage.
 *
 * Lets a test start from a state the queue can reach but would be tedious to
 * drive to — a live lease, an exhausted entry, a stale schema version.
 */
export function storedEntry(
  id: string,
  over: Partial<QueueEntry<TestPayload>> = {},
): [string, string] {
  const at = "2026-01-01T00:00:00.000Z";
  const entry: QueueEntry<TestPayload> = {
    id,
    payload: { id },
    status: "PENDING",
    attempts: 0,
    enqueuedAt: at,
    nextAttemptAt: at,
    leaseExpiresAt: null,
    schemaVersion: 1,
    ...over,
  };
  return [`QUEUE:test:u1:${id}`, JSON.stringify(entry)];
}
