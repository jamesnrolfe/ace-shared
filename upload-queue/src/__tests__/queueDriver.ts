import { Result, unwrap } from "../../../ts-utils/src";
import { createQueueCore, QueueCore } from "../queue";
import { QueueConfig, QueueEntry, QueueStatus, RunSummary } from "../types";
import {
  FakeClock,
  FakeUploader,
  fakeClock,
  fakeUploader,
  MemoryStorage,
  memoryStorage,
  payload,
  TestPayload,
  testConfig,
} from "./queueFactory";

export interface QueueDriver<T> {
  core: QueueCore<TestPayload>;
  storage: MemoryStorage;
  clock: FakeClock;
  uploader: FakeUploader<T>;

  /** Enqueue by id, returning the outcome. */
  add(id: string, label?: string): Promise<Result<string>>;
  /** One drain pass. */
  run(): Promise<RunSummary>;
  advance(ms: number): void;

  entries(): Promise<ReadonlyArray<QueueEntry<TestPayload>>>;
  entry(id: string): Promise<QueueEntry<TestPayload> | undefined>;
  /** `{ id: status }`, the quickest way to assert on the whole queue. */
  statuses(): Promise<Record<string, QueueStatus>>;
  /** Keys actually written, for asserting durability rather than in-memory state. */
  storedIds(): string[];
}
export function createQueueDriver<T = string>(
  overrides: Partial<QueueConfig<TestPayload, T>> = {},
  seed: Record<string, string> = {},
): QueueDriver<T> {
  const storage = memoryStorage(seed);
  const clock = fakeClock();
  const uploader = fakeUploader<T>();

  const config = testConfig<T>({ upload: uploader.upload, ...overrides });
  const core = createQueueCore(config, {
    storage,
    clock: clock.now,
    namespace: "u1",
  });

  return {
    core,
    storage,
    clock,
    uploader,
    add: (id, label) => core.enqueue(payload(id, label)),
    run: async () => unwrap(await core.runOnce()),
    advance: (ms) => clock.advance(ms),
    entries: async () => unwrap(await core.list()),
    async entry(id) {
      return unwrap(await core.list()).find((e) => e.id === id);
    },
    async statuses() {
      const all = unwrap(await core.list());
      return Object.fromEntries(all.map((e) => [e.id, e.status] as const));
    },
    storedIds: () =>
      Object.keys(storage.dump())
        .filter((k) => k.startsWith("QUEUE:test:u1:"))
        .map((k) => k.replace("QUEUE:test:u1:", "")),
  };
}
