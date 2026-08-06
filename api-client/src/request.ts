import {
  catchApiErrors,
  decodeErrorMessageFromServerResponse,
  UNKNOWN_ERROR,
} from "./errors";
import { isServerResponse } from "./guards";
import { parseJsonFromResponse } from "./parsing";
import type { ApiResponse, ServerResponse } from "./types";

export type Extractror<T> = (parsed: ServerResponse, res: Response) => T;

export async function apiRequest<T = void>(
  fetchFn: () => Promise<Response>,
  extract?: Extractror<T>,
): Promise<ApiResponse<T>> {
  try {
    const res = await fetchFn();
    const parsed = await parseJsonFromResponse(res);
    if (!isServerResponse(parsed)) return UNKNOWN_ERROR;
    if (!parsed.success)
      return decodeErrorMessageFromServerResponse(parsed, res.status);
    return (
      extract
        ? { success: true, data: extract(parsed, res) }
        : { success: true }
    ) as ApiResponse<T>;
  } catch (err) {
    return catchApiErrors(err);
  }
}
