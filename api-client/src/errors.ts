import { type Err, err } from "../../ts-utils/src/index";
import type { ApiError, ServerResponse } from "./types";

export const UNKNOWN_ERROR: Err<ApiError> = err({
  message:
    "Unhandled error occurred. Contact a system administrator and try again later.",
  code: "UNKNOWN_ERROR",
});

export const NETWORK_ERROR: Err<ApiError> = err({
  message: "Network error occurred.",
  code: "NETWORK_ERROR",
});

export const TIMEOUT_ERROR: Err<ApiError> = err({
  message: "Request timed out",
  code: "TIMEOUT_ERROR",
});

export const NO_RECORDS_ERROR: Err<ApiError> = err({
  code: "NO_RECORDS_FOUND",
  message: "No data found",
});

export function catchApiErrors(caught: unknown): Err<ApiError> {
  if (
    caught &&
    typeof caught === "object" &&
    "name" in caught &&
    (caught as Record<string, unknown>).name === "AbortError"
  ) {
    return TIMEOUT_ERROR;
  }
  return NETWORK_ERROR;
}

export function decodeErrorMessageFromServerResponse(
  res: ServerResponse,
): Err<ApiError> {
  console.warn("[api-client]: Server returned error:", res.error);
  return err({ message: res.error_message, code: res.error });
}
