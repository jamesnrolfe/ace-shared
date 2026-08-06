import type { Drawing } from "./drawing";

/** Availability status for an asset. */
export type AssetAvailability =
  | "AVAILABLE"
  | "CLAIMED"
  | "IN_PROGRESS"
  | "COMPLETED";

/** Subset of {@link Drawing} fetched with assets. */
export type AssetDrawing = Pick<
  Drawing,
  "drawing_id" | "drawing_name" | "download_url"
> & {
  // params become optional
  readonly drawing_id: string | null;
  readonly download_url: string | null;
};

export interface PinLocation {
  readonly x: number;
  readonly y: number;
}

/** Information about an asset */
export interface Asset {
  readonly uaid: string;
  readonly status: AssetAvailability | null;
  readonly claimed_by: number | null;
  readonly location_key: string | null;
  readonly drawing: AssetDrawing;
  readonly pin_location: PinLocation | null;
  readonly updated_at: string;
  readonly name: string;
  readonly building_name: string | null;
  readonly building_level_display: string | null;
  readonly door_use_display: string | null;
  readonly ace_id: string | null;
  readonly project: string | null;
  readonly project_num: string | null;
  readonly known_qr_codes: readonly string[] | null;
  /** Note that this is a text[] col - not numeric */
  readonly known_ace_ids: readonly string[] | null;
  readonly form_data: Record<string, unknown> | null;
}
