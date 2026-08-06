import { ok } from "../../ts-utils/src/index";
import {
  catchApiErrors,
  decodeErrorMessageFromServerResponse,
  UNKNOWN_ERROR,
} from "./errors";
import { isServerResponse } from "./guards";
import { parseJsonFromResponse } from "./parsing";
import type { ApiResponse, ServerResponse } from "./types";

export type Extractor<T> = (parsed: ServerResponse, res: Response) => T;

export async function apiRequest<T = void>(
  fetchFn: () => Promise<Response>,
  extract?: Extractor<T>,
): Promise<ApiResponse<T>> {
  try {
    const res = await fetchFn();
    const parsed = await parseJsonFromResponse(res);
    if (!isServerResponse(parsed)) return UNKNOWN_ERROR;
    if (!parsed.success) return decodeErrorMessageFromServerResponse(parsed);
    return (extract ? ok(extract(parsed, res)) : ok()) as ApiResponse<T>;
  } catch (caught) {
    return catchApiErrors(caught);
  }
}
