/**
 * The persistence surface the queue needs, as a port.
 *
 * Deliberately mirrors AsyncStorage shape so RN can pass through easily,
 * but can be adapted to other storage systems.
 *
 * Also means it can be run as a headless background task.
 */
export interface QueueStorage {
  keys(prefix: string): Promise<readonly string[]>;
  getMany(
    keys: readonly string[],
  ): Promise<ReadonlyArray<readonly [string, string | null]>>;
  set(key: string, value: string): Promise<void>;
  setMany(pairs: ReadonlyArray<readonly [string, string]>): Promise<void>;
  remove(keys: readonly string[]): Promise<void>;
}

/** Milliseconds since epoch. Injected so backoff and leases are testable. */
export type Clock = () => number;
