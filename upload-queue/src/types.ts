import type { Result } from "../../ts-utils/src/index";

/** Terminal states are `DEAD` and removal; everything else is in progress */
export type QueueStatus = "PENDING" | "IN_FLIGHT" | "FAILED" | "DEAD";

export interface QueueError {
  readonly message: string;
  readonly code?: string;
  /** `false` sends the entry straight to `DEAD` */
  readonly retryable: boolean;
}

export interface QueueEntry<TPayload> {
  readonly id: string;
  readonly payload: TPayload;
  readonly status: QueueStatus;
  readonly attempts: number;
  readonly enqueuedAt: string;
  readonly nextAttemptAt: string;
  /** Cross context lock. Non-null only while `IN_FLIGHT` */
  readonly leaseExpiresAt: string | null;
  readonly lastError?: QueueError;
  readonly schemaVersion: number;
}

export type UploadResult<T> = Result<T, QueueError>;

/** Result of one drain pass, for logging. */
export interface RunSummary {
  /**
   * Number of entries claimed this run.
   */
  readonly claimed: number;
  /**
   * Number of entries that successfully uploaded this run.
   */
  readonly succeeded: number;
  /**
   * Number of entries that recoverably failed this run.
   */
  readonly failed: number;
  /**
   * Number of entries the unrecoverably failed this run.
   *
   * This is either because the failiure was terminal,
   * or the attempt budget is spent.
   */
  readonly died: number;
  /**
   * Number of entries whose status was returned to PENDING
   * because their lease expired.
   *
   * This is usually because of a process being killed mid-work,
   * leaving entries stranded until their lease expires.
   */
  readonly reclaimed: number;
}

/** What the queue hands to each upload, besides its payload. */
export interface UploadContext {
  /**
   * Pushes this entry's lease out by another `leaseMs`, so a long upload that
   * is still making progress isn't reclaimed and started again elsewhere.
   *
   * Does nothing once the upload has returned, or if the entry has gone.
   */
  readonly extendLease: () => Promise<void>;
}

export interface QueueConfig<TPayload, TResult> {
  /** Storage namespace and log prefix. */
  readonly name: string;
  readonly schemaVersion: number;
  /** Stable identity. Doubles as idempotency key sent to the server. */
  readonly getId: (payload: TPayload) => string;
  /**
   * Most uploads in flight at once. A function is asked afresh at the start
   * of every pass, so the limit can follow the connection.
   */
  readonly concurrency: number | (() => number | Promise<number>);
  readonly maxAttempts: number;
  readonly leaseMs: number;
  readonly backoffMs: (attempts: number) => number;
  /**
   * Called once per pass with every payload just claimed, before any upload
   * starts - for work cheaper done in bulk, like fetching upload URLs in one
   * request. A throw is logged and ignored: uploads must cope without it.
   */
  readonly prepare?: (payloads: readonly TPayload[]) => Promise<void>;
  readonly upload: (
    payload: TPayload,
    context: UploadContext,
  ) => Promise<UploadResult<TResult>>;
  readonly migrate?: (raw: unknown, fromVersion: number) => TPayload | null;
  readonly onSuccess?: (
    payload: TPayload,
    value: TResult,
  ) => void | Promise<void>;
  readonly onDead?: (
    payload: TPayload,
    error: QueueError,
  ) => void | Promise<void>;
}
