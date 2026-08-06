export interface LocationKey {
  readonly key: string;
  readonly description: string;
  readonly project: string | null;
  readonly client: string | null;
  readonly client_group: string | null;
  readonly group: string | null;
}
