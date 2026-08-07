export interface RequestHint {
  readonly name: string;
  readonly weight?: "default" | "long";
}

export type Fetcher = (
  url: string,
  options: RequestInit,
  hint: RequestHint,
) => Promise<Response>;

export interface ApiClient {
  readonly fetcher: Fetcher;
}
