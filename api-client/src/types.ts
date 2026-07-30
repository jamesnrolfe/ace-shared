export type ServerErrorCode =
  | "SERVER_ERROR"
  | "NOT_IMPLEMENTED"
  | "PERMISSION_DENIED"
  | "USERHASH_FAIL"
  | "UPDATE_USER_ERROR"
  | "USERNAME_TAKEN"
  | "INVALID_PARAMS"
  | "NOT_FOUND"
  | "TOKEN_INVALID"
  | "TOKEN_EXPIRED"
  | "UNKNOWN_ERROR"
  | "NETWORK_ERROR"
  | "NO_RECORDS_FOUND"
  | "TIMEOUT_ERROR"
  | "REFRESH_TOKEN_REVOKED"
  | "REFRESH_TOKEN_EXPIRED"
  | "USER_DISABLED"
  | "TOO_MANY_REQUESTS";

export interface ServerResponse {
  readonly success: boolean;
  readonly error?: ServerErrorCode;
  readonly error_message?: string;
  readonly meta?: Record<string, unknown>;
  readonly data?: unknown[];
}

/**
 * Success shape after decoding a {@link ServerResponse}.
 *
 * Callers choose what `T` by picking the relevant field(s) off the
 * `ServerResponse` themselves. This type doesn't presume `meta` vs `data`.
 */
export type ApiResponseSuccess<T> = T extends void
  ? { success: true }
  : { success: true; data: T };

/**
 * Failure shape after decoding a {@link ServerResponse}.
 */
export interface ApiResponseFailure {
  success: false;
  message?: string;
  code?: ServerErrorCode;
  status?: number;
}

export type ApiResponse<T> = ApiResponseFailure | ApiResponseSuccess<T>;
