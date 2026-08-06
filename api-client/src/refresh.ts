import type { ServerErrorCode } from "./types";

/**
 * Wrap an authenticated API call with automatic token refresh.
 *
 * If the initial call fails with `TOKEN_EXPIRED` or `TOKEN_INVALID`, calls
 * `refreshFn`, which should silently go off and obtain a new access token. If
 * successful, retry the original `apiFn` once with the new token.
 *
 * On failure, call `logoutFn`, which can either do nothing, or more commonly
 * log the user out to attempt a proper refresh, returning `null`.
 */
export async function callWithRefresh<
  T extends { success: boolean; code?: ServerErrorCode },
>(
  apiFn: (token: string) => Promise<T>,
  currentToken: string,
  refreshFn: () => Promise<string | null>,
  logoutFn: () => void | Promise<void>,
): Promise<T | null> {
  const result = await apiFn(currentToken);

  if (
    result.success === false &&
    (result.code === "TOKEN_EXPIRED" || result.code === "TOKEN_INVALID")
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
  T extends { success: boolean; code?: ServerErrorCode },
>(
  fn: (...args: [...Args, string]) => Promise<T>,
  getToken: () => string,
  refreshFn: () => Promise<string | null>,
  logoutFn: () => void | Promise<void>,
): (...args: Args) => Promise<T | null> {
  return (...args: Args) =>
    callWithRefresh(
      (token) => fn(...args, token),
      getToken(),
      refreshFn,
      logoutFn,
    );
}
