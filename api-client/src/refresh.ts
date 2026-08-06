import { err, type Result } from "../../ts-utils/src/index";
import type { ApiError } from "./types";

const SESSION_EXPIRED_ERROR: ApiError = {
  message: "Your session has expired. Please sign in again.",
  code: "TOKEN_EXPIRED",
};

/**
 * Wrap an authenticated API call with automatic token refresh.
 *
 * If the initial call fails with `TOKEN_EXPIRED` or `TOKEN_INVALID`, calls
 * `refreshFn`, which should silently go off and obtain a new access token. If
 * successful, retry the original `apiFn` once with the new token.
 *
 * On failure, calls `logoutFn` (which can either do nothing, or more
 * commonly log the user out to attempt a proper re-login) and resolves to
 * `SESSION_EXPIRED_ERROR` - this always resolves to a `Result`, never `null`,
 * so callers don't need a separate null-check on top of the usual `.ok`
 * narrowing.
 */
export async function callWithRefresh<T>(
  apiFn: (token: string) => Promise<Result<T, ApiError>>,
  currentToken: string,
  refreshFn: () => Promise<string | null>,
  logoutFn: () => void | Promise<void>,
): Promise<Result<T, ApiError>> {
  const result = await apiFn(currentToken);

  if (
    !result.ok &&
    (result.error.code === "TOKEN_EXPIRED" || result.error.code === "TOKEN_INVALID")
  ) {
    const newToken = await refreshFn();
    if (!newToken) {
      await logoutFn();
      return err(SESSION_EXPIRED_ERROR);
    }
    return apiFn(newToken);
  }

  return result;
}

/**
 * Binds a token-taking API function to a fixed token/refresh/logout source.
 *
 * The returned function drops the trailing `token` argument entirely - call
 * sites no longer thread it through. Requires `fn`'s last parameter to be
 * `token: string`.
 */
export function bindWithRefresh<Args extends unknown[], T>(
  fn: (...args: [...Args, string]) => Promise<Result<T, ApiError>>,
  getToken: () => string,
  refreshFn: () => Promise<string | null>,
  logoutFn: () => void | Promise<void>,
): (...args: Args) => Promise<Result<T, ApiError>> {
  return (...args: Args) =>
    callWithRefresh((token) => fn(...args, token), getToken(), refreshFn, logoutFn);
}
