/**
 * A value that's either a success (`ok: true`) holding `T`, or a failure
 * (`ok: false`) holding `E`. Modelled on Rust's `Result<T, E>`, narrowing
 * via the `ok` discriminant.
 */
export type Result<T, E = string> = Ok<T> | Err<E>;

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export function ok<T>(value: T): Ok<T>;
export function ok(): Ok<void>;
export function ok<T>(value?: T): Ok<T | void> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/** Unwrap `result`'s value, or `fallback` if `ok=false`. */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}
