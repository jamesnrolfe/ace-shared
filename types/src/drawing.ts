/**
 * A drawing row from `as_drawings`.
 */
export interface Drawing {
  readonly drawing_id: string;
  readonly drawing_name: string;
  readonly download_url: string | null;
  readonly location_keys: string[];
  readonly block: string | null;
  readonly level: string | null;
  readonly source: string | null;
  readonly project_num: number;
}
