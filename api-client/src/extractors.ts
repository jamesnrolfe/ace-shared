import { Extractror } from "./request";

/**
 * Extracts `data` as a list of `T`.
 */
export function fromList<T>(guard?: (v: unknown) => v is T): Extractror<T[]> {
  return (parsed) => {
    const arr = parsed.data ?? [];
    return guard ? arr.filter(guard) : (arr as T[]);
  };
}

/**
 * Extract the first item of `data` or `null` if empty.
 *
 * This is a common usecase as `data` is restricted to being a list, so where
 * one item is returned it is common to place it as the only item in this list.
 */
export function fromFirstItem<T>(): Extractror<T | null> {
  return (parsed) => ((parsed.data ?? [])[0] ?? null) as T | null;
}

/**
 * Extracts `meta` as a `T`.
 */
export function fromMeta<T>(): Extractror<T> {
  return (parsed) => (parsed.meta ?? {}) as T;
}
