import type { ApiResponseFailure, ServerResponse } from "./types";

export const UNKNOWN_ERROR: ApiResponseFailure = {
  success: false,
  message:
    "Unhandled error occurred. Contact a system administrator and try again later.",
  status: 500,
  code: "UNKNOWN_ERROR",
};

export const NETWORK_ERROR: ApiResponseFailure = {
  success: false,
  message: "Network error occurred.",
  status: 500,
  code: "NETWORK_ERROR",
};

export const TIMEOUT_ERROR: ApiResponseFailure = {
  success: false,
  message: "Request timed out",
  code: "TIMEOUT_ERROR",
  status: 500,
};

export const NO_RECORDS_ERROR: ApiResponseFailure = {
  success: false,
  code: "NO_RECORDS_FOUND",
  message: "No data found",
  status: 500,
};

/**
 * Generic catch for network-layer failures.
 *
 * Distinguishes an aborted request (timeout) from any other network
 * failure, returning {@link TIMEOUT_ERROR} or {@link NETWORK_ERROR}
 * respectively.
 */
export function catchApiErrors(err: unknown): ApiResponseFailure {
  if (
    err &&
    typeof err === "object" &&
    "name" in err &&
    (err as Record<string, unknown>).name === "AbortError"
  ) {
    return TIMEOUT_ERROR;
  }
  return NETWORK_ERROR;
}

/**
 * Decode a failed {@link ServerResponse} into the app-facing failure shape.
 *
 * Assumes `res.success` is already known to be `false` - the caller is
 * expected to have checked that first.
 */
export function decodeErrorMessageFromServerResponse(
  res: ServerResponse,
  status: number,
): ApiResponseFailure {
  console.warn("[api-client]: Server returned error:", res.error);
  return {
    success: false,
    message: res.error_message,
    code: res.error,
    status,
  };
}
