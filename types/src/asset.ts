import type { Drawing } from "./drawing";

/** Availability status for an asset. */
export type AssetAvailability =
  | "AVAILABLE"
  | "CLAIMED"
  | "IN_PROGRESS"
  | "COMPLETED";

/**
 * Subset of {@link Drawing} fetched with assets.
 *
 * `drawing_id`/`download_url` are nullable here (unlike on `Drawing` itself)
 * for assets not yet placed on a drawing.
 */
export interface AssetDrawing {
  readonly drawing_id: string | null;
  readonly drawing_name: string;
  readonly download_url: string | null;
}

export interface PinLocation {
  readonly x: number;
  readonly y: number;
}

/** Where did a visit come from? */
export type VisitSource = string;

/** Visit data concerning the history of an asset */
export interface ExternalVisitData {
  /** ID of row in as_augmented_visits */
  readonly id: number;
  /** List of photos from previous visits to be used in forms if possible */
  readonly photos: readonly VisitDataPhoto[];
  /** Where did this visit come from? */
  readonly source: VisitSource;
  /** Any derived data to be seeded into the form */
  readonly derived: Record<string, unknown>;
  /** Visit history from different sources */
  readonly history: readonly VisitEvent[];
  readonly created_at: string;
  readonly updated_at: string;
  readonly source_xref: string;
  readonly photo_source_xref: string;
}

export interface VisitDataPhoto {
  /** ID of the photo - same as everywhere incl. blob storage */
  readonly photo_id: string;
  /** Properties of the photo, including its context and any qr info */
  readonly properties: VisitDataPhotoProperties;
  /** Base64 thumbnail from the photos table, if available */
  readonly thumbnail?: string | null;
  /** Download URL from the photos table, if available */
  readonly download_url?: string | null;
}

interface VisitDataPhotoProperties {
  /** Context for the photo. This should match to a question_id in the form */
  readonly context: string | null;
  /** A list of qr codes associated with the photo. We should only take one */
  readonly qr_code: readonly string[] | null;
  /** @deprecated Use top level photo_id instead in {@link VisitDataPhoto}. */
  readonly photo_id: string;
  /** Where the photo originally came from (OneTrace field) */
  readonly field_name: string;
  /** Source XREF for the photo */
  readonly source_xref: string;
}

/** Object describing a historic visit */
export interface VisitEvent {
  /** From which platform was this visit submitted? */
  readonly source: VisitSource;
  /** When did this visit happen in format YYYY-MM-DD. */
  readonly event_date: string;
  /** Source XREF of visit. */
  readonly source_xref: string;
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
  /**
   * Historic visit data (prior submissions, photos, derived seed values),
   * used to seed forms from a previous visit. Optional since not every
   * consumer's assets endpoint returns it.
   */
  readonly visit_data?: ExternalVisitData;
}
