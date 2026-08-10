export type Role = "ADMIN" | "USER" | "MANAGER" | "SCRIPT";

export interface OrganisationInformation {
  readonly id: number;
  readonly name: string | null;
  /**
   * Org-specific vocabulary overrides (e.g. "Job" instead of "Work Object").
   * Deliberately untyped here — the word-key catalog is app-local UI
   * infrastructure, not domain data. Each app should cast/narrow to its own
   * word-catalog type at the point of use.
   */
  readonly words: Readonly<Record<string, unknown>>;
}

export interface User {
  readonly user_id: number;
  readonly username: string;
  readonly token: string;
  readonly token_exp_ts: string;
  /** Absent when the refresh token is delivered as an httpOnly cookie instead of in the body. */
  readonly refresh_token?: string;
  readonly refresh_token_exp_ts?: string;
  readonly roles: readonly Role[];
  readonly display_name: string;
  readonly email: string;
  readonly phone: string | null;
  readonly photo: string | null;
  /** @deprecated Use `org.id` instead. */
  readonly org_id: number;
  readonly org: OrganisationInformation;
  readonly options: Readonly<Record<string, unknown>>;
}

export interface OtherUser {
  readonly user_id: number;
  readonly username: string;
  readonly display_name: string;
  readonly email: string;
  readonly phone: string | null;
  readonly roles: readonly Role[];
  readonly enabled: boolean;
  /** @deprecated */
  readonly org_id: number;
  readonly photo: string | null;
}
