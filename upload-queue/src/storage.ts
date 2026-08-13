/**
 * The persistence surface the queue needs, as a port.
 *
 * Deliberately mirrors AsyncStorage shape so RN can pass through easily,
 * but can be adapted to other storage systems.
 *
 * Also means it can be run as a headless background task.
 */
export interface QueueStorage {
  /**
   * Returns the keys associated with the given prefix.
   */
  keys(prefix: string): Promise<readonly string[]>;
  /**
   * Takes a list of keys and returns the values associated.
   *
   * If any key does not exist, will return it with `null`.
   */
  getMany(
    keys: readonly string[],
  ): Promise<ReadonlyArray<readonly [string, string | null]>>;
  /**
   * Set a key-value pair.
   */
  set(key: string, value: string): Promise<void>;
  /**
   * Set many key-value pairs.
   */
  setMany(pairs: ReadonlyArray<readonly [string, string]>): Promise<void>;
  /**
   * Remove an entry from storage by its key.
   */
  remove(keys: readonly string[]): Promise<void>;
}

/** Milliseconds since epoch. Injected so backoff and leases are testable. */
export type Clock = () => number;
