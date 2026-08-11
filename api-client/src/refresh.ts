import { err, type Result } from "../../ts-utils/src/index";
import type { ApiError } from "./types";

const SESSION_EXPIRED_ERROR: ApiError = {
  message: "Your session has expired. Please sign in again.",
  code: "TOKEN_EXPIRED",
};

const REFRESH_DEFERRED_ERROR: ApiError = {
  message:
    "Could not reach the server to renew your session. This will be retried automatically.",
  code: "REFRESH_DEFERRED",
};

/**
 * The results of attempting to renew an expired access token.
 *
 * What callers need is not *why* a refresh failed by whether the session
 * is recoverable.
 * - `DEFERRED` means try again later
 * - `ENDED` means only a fresh sign in will help
 * - `REFRESHED` was a successful refresh - no issues
 */
export type RefreshOutcome =
  | { readonly status: "REFRESHED"; readonly token: string }
  | { readonly status: "DEFERRED" }
  | { readonly status: "ENDED" };

/**
 * Wrap an authenticated API call with automatic token refresh.
 *
 * If the initial call fails with `TOKEN_EXPIRED` or `TOKEN_INVALID`, calls
 * `refreshFn`, which should silently go off and obtain a new access token.
 *
 * `logoutFn` runs only on `ENDED`. A `DEFERRED` refresh resolves to
 * `REFRESH_DEFERRED_ERROR`, and leaves the session untouched, so background
 * retry loops can keep trying without evicting the user.
 */
export async function callWithRefresh<T>(
  apiFn: (token: string) => Promise<Result<T, ApiError>>,
  currentToken: string,
  refreshFn: () => Promise<RefreshOutcome>,
  logoutFn: () => void | Promise<void>,
): Promise<Result<T, ApiError>> {
  const result = await apiFn(currentToken);

  if (result.ok) return result;

  const code = result.error.code;
  if (code !== "TOKEN_EXPIRED" && code !== "TOKEN_INVALID") return result;

  const outcome = await refreshFn();

  switch (outcome.status) {
    case "REFRESHED":
      return apiFn(outcome.token);
    case "DEFERRED":
      return err(REFRESH_DEFERRED_ERROR);
    case "ENDED":
      await logoutFn();
      return err(SESSION_EXPIRED_ERROR);
  }
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
  refreshFn: () => Promise<RefreshOutcome>,
  logoutFn: () => void | Promise<void>,
): (...args: Args) => Promise<Result<T, ApiError>> {
  return (...args: Args) =>
    callWithRefresh(
      (token) => fn(...args, token),
      getToken(),
      refreshFn,
      logoutFn,
    );
}
