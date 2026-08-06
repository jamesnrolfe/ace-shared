export type WorkObjectStatus =
  | "DRAFT"
  | "WAITING"
  | "ACTIVE"
  | "PAUSED"
  | "COMPLETED"
  | "ARCHIVED";

export interface WorkObjectPassIn {
  has_drawings?: boolean;
  require_sticker?: boolean;
  [key: string]: unknown;
}

export interface WorkObjectProperties {
  allow_create_asset?: boolean;
  available_location_keys?: string[];
  [key: string]: unknown;
}

export interface WorkObjectDrawing {
  readonly drawing_id: string;
  readonly drawing_name: string | null;
  /**
   * Confusingly named to match the backends own alisaing: this is actually the drawings block.
   */
  readonly building_name: string | null;
  readonly building_level: string | null;
  readonly download_url?: string | null;
  readonly location_keys?: readonly string[];
}

export interface WorkObject {
  readonly id: number;
  readonly uwkoid: string;
  readonly owner_id: number;
  readonly work_object_name: string;
  readonly project_num: number | null;
  readonly project_name: string | null;
  readonly location_key: string | null;
  readonly form_ids: readonly number[];
  readonly drawings: readonly WorkObjectDrawing[];
  readonly existing_uaids: readonly string[];
  readonly operatives: readonly number[];
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly status: WorkObjectStatus;
  readonly completed_date: string | null;
  readonly properties: WorkObjectProperties;
  readonly pass_in: WorkObjectPassIn;
  readonly created_at: string;
  readonly updated_at: string;
}
