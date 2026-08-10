import { apiRequest } from "../request";
import { ApiResponse } from "../types";

export async function getAllLocationKeys(
  token: string,
): Promise<ApiResponse<LocationKey[]>> {
  return apiRequest(() => )
}
