import type { Result } from "@ace/forms-core-ts-utils";
import type { ServerErrorCode } from "./types";

export async function callWithRefresh<T, E extends { code?: ServerErrorCode }>(
  apiFn: (token: string) => Promise<Result<T, E>>,
  currentToken: string,
  refreshFn: () => Promise<string | null>,
  logoutFn: () => void | Promise<void>,
): Promise<Result<T, E> | null> {
  const result = await apiFn(currentToken);

  if (
    !result.ok &&
    (result.error.code === "TOKEN_EXPIRED" ||
      result.error.code === "TOKEN_INVALID")
  ) {
    const newToken = await refreshFn();
    if (!newToken) {
      await logoutFn();
      return null;
    }
    return apiFn(newToken);
  }

  return result;
}

export function bindWithRefresh<
  Args extends unknown[],
  T,
  E extends { code?: ServerErrorCode },
>(
  fn: (...args: [...Args, string]) => Promise<Result<T, E>>,
  getToken: () => string,
  refreshFn: () => Promise<string | null>,
  logoutFn: () => void | Promise<void>,
): (...args: Args) => Promise<Result<T, E> | null> {
  return (...args: Args) =>
    callWithRefresh(
      (token) => fn(...args, token),
      getToken(),
      refreshFn,
      logoutFn,
    );
}
