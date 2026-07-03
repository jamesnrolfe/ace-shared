import { ServerResponse } from "./types";

/**
 * Safely read a fetch `Response` body as JSON.
 *
 * Returns an empty record if body is empty or isn't valud JSON, rather than throwing.
 * Callers should follow up with {@link isServerResponse} before trusting the shape.
 */
export async function parseJsonFromResponse(
  res: Response,
): Promise<Partial<ServerResponse>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
