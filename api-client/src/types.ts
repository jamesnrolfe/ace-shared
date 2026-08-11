import type { Result } from "../../ts-utils/src/index";

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
  | "REFRESH_DEFERRED"
  | "USER_DISABLED"
  | "TOO_MANY_REQUESTS";

export interface ServerResponse {
  readonly success: boolean;
  readonly error?: ServerErrorCode;
  readonly error_message?: string;
  readonly meta?: Record<string, unknown>;
  readonly data?: unknown[];
}

export interface ApiError {
  readonly message?: string;
  readonly code?: ServerErrorCode;
}

export type ApiResponse<T> = Result<T, ApiError>;
