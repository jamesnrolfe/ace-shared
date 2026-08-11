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
  readonly claimed: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly died: number;
  readonly killed: number;
}

export interface QueueConfig<TPayload, TResult> {
  /** Storage namespace and log prefix. */
  readonly name: string;
  readonly schemaVersion: number;
  /** Stable identity. Doubles as idempotency key sent to the server. */
  readonly getId: (payload: TPayload) => string;
  readonly concurrency: number;
  readonly maxAttempts: number;
  readonly leaseMs: number;
  readonly backoffMs: (attempts: number) => number;
  readonly upload: (payload: TPayload) => Promise<UploadResult<TResult>>;
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
