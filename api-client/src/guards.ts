import { ServerResponse } from "./types";

/** Narrow an unknown value down to a plain object. */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Checks whether a value looks like a {@link ServerResponse}.
 *
 * Only checks for boolean `success` key - deliberately loose, since this
 * guards a parsed JSON body of otherwise unknown shape.
 */
export function isServerResponse(value: unknown): value is ServerResponse {
  if (!isObject(value)) return false;
  return typeof value.success === "boolean";
}
