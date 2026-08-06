import { Extractror } from "./request";

export function fromList<T>(guard?: (v: unknown) => v is T): Extractror<T[]> {
  return (parsed) => {
    const arr = parsed.data ?? [];
    return guard ? arr.filter(guard) : (arr as T[]);
  };
}

export function fromFirstItem<T>(): Extractror<T | null> {
  return (parsed) => ((parsed.data ?? [])[0] ?? null) as T | null;
}

export function fromMeta<T>(): Extractror<T> {
  return (parsed) => (parsed.meta ?? {}) as T;
}
