import { err, ok, Result } from "../../ts-utils/src";
import { isDue, isLeaseExpired } from "./schedule";
import { Clock, QueueStorage } from "./storage";
import { QueueConfig, QueueEntry, RunSummary } from "./types";

export interface QueueCore<TPayload> {
  /** Takes custody of `payload`. `ok` holds the entry id. */
  enqueue(payload: TPayload): Promise<Result<string>>;
  list(): Promise<Result<ReadonlyArray<QueueEntry<TPayload>>>>;
  /** Kill lapsed leases -> claim what is due, upload it, record the outcome. */
  runOnce(): Promise<Result<RunSummary>>;
  remove(id: string): Promise<Result<void>>;
  /** Return a `DEAD` or `FAILED` entry to the front of the queue. */
  retryNow(id: string): Promise<Result<void>>;
}

export interface QueueDeps {
  readonly storage: QueueStorage;
  readonly clock: Clock;
  /** Scopes keys to one user, so a second sign-in cannot see the first's work. */
  readonly namespace: string;
}

const reason = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

export function createQueueCore<TPayload, TResult>(
  config: QueueConfig<TPayload, TResult>,
  deps: QueueDeps,
): QueueCore<TPayload> {
  const { storage, clock, namespace } = deps;
  const prefix = `QUEUE:${config.name}:${namespace}:`;
  const keyFor = (id: string) => `${prefix}${id}`;
  const iso = (ms: number) => new Date(ms).toISOString();

  const write = (entry: QueueEntry<TPayload>) =>
    storage.set(keyFor(entry.id), JSON.stringify(entry));

  /** Throws on storage failure - public `list` wraps it. */
  async function readAll(): Promise<QueueEntry<TPayload>[]> {
    const keys = await storage.keys(prefix);
    const stored = await storage.getMany(keys);
    const entries: QueueEntry<TPayload>[] = [];

    for (const [key, raw] of stored) {
      if (!raw) continue;
      // parse per entry: one unreadable value would otherwise cost the queue
      try {
        const parsed = JSON.parse(raw) as QueueEntry<TPayload>;
        if (parsed.schemaVersion === config.schemaVersion) {
          entries.push(parsed);
          continue;
        }
        // have to migrate old versions
        const migrated = config.migrate?.(parsed.payload, parsed.schemaVersion);
        if (migrated == null) {
          await storage.remove([key]);
          continue;
        }
        entries.push({
          ...parsed,
          payload: migrated,
          schemaVersion: config.schemaVersion,
        });
      } catch {
        // remove on error
        await storage.remove([key]);
      }
    }

    return entries;
  }

  async function list(): Promise<Result<ReadonlyArray<QueueEntry<TPayload>>>> {
    try {
      return ok(await readAll());
    } catch (e) {
      return err(reason(e));
    }
  }

  async function enqueue(payload: TPayload): Promise<Result<string>> {
    const id = config.getId(payload);
    const now = clock();

    try {
      await write({
        id,
        payload,
        status: "PENDING",
        attempts: 0,
        enqueuedAt: iso(now),
        nextAttemptAt: iso(now),
        leaseExpiresAt: null,
        schemaVersion: config.schemaVersion,
      });
      return ok(id);
    } catch (e) {
      // caller still holds the only copy - it must not discard its draft
      return err(reason(e));
    }
  }

  async function runOnce(): Promise<Result<RunSummary>> {
    try {
      const now = clock();

      // kill first: a lapsed lease means the previous worked died, not that
      // the upload failed, so attempt count is left alone
      let killed = 0;
      const entries: QueueEntry<TPayload>[] = [];
      for (const entry of await readAll()) {
        if (
          entry.status === "IN_FLIGHT" &&
          isLeaseExpired(entry.leaseExpiresAt, now)
        ) {
          const revived = {
            ...entry,
            status: "PENDING" as const,
            leaseExpiresAt: null,
          };
          await write(revived);
          entries.push(revived);
          killed++;
        } else {
          entries.push(entry);
        }
      }

      const inFlight = entries.filter((e) => e.status === "IN_FLIGHT").length;
      const slots = Math.max(0, config.concurrency - inFlight);

      const claimed: QueueEntry<TPayload>[] = [];
      for (const entry of entries
        // filter out only pending or failed that are due a new upload
        .filter(
          (e) =>
            (e.status === "PENDING" || e.status === "FAILED") &&
            isDue(e.nextAttemptAt, now),
        )
        // sort by queue time
        .sort((a, b) => a.enqueuedAt.localeCompare(b.enqueuedAt))
        // only take the first `slots` items
        .slice(0, slots)) {
        const leased = {
          ...entry,
          status: "IN_FLIGHT" as const,
          leaseExpiresAt: iso(now + config.leaseMs),
        };
        await write(leased);
        claimed.push(leased);
      }

      let succeeded = 0;
      let failed = 0;
      let died = 0;

      await Promise.all(
        claimed.map(async (entry) => {
          const result = await config.upload(entry.payload);

          if (result.ok) {
            await storage.remove([keyFor(entry.id)]);
            await config.onSuccess?.(entry.payload, result.value);
            succeeded++;
            return;
          }

          // attempts increment on failure, not on claim, so a process killed
          // mid-upload costs nothing.
          const attempts = entry.attempts + 1;
          const isDead =
            !result.error.retryable || attempts >= config.maxAttempts;

          await write({
            ...entry,
            status: isDead ? "DEAD" : "FAILED",
            attempts,
            leaseExpiresAt: null,
            lastError: result.error,
            nextAttemptAt: iso(
              clock() + (isDead ? 0 : config.backoffMs(attempts)),
            ),
          });

          if (isDead) {
            await config.onDead?.(entry.payload, result.error);
            died++;
          } else {
            failed++;
          }
        }),
      );

      return ok({ claimed: claimed.length, succeeded, failed, died, killed });
    } catch (e) {
      return err(reason(e));
    }
  }

  async function remove(id: string): Promise<Result<void>> {
    try {
      await storage.remove([keyFor(id)]);
      return ok();
    } catch (e) {
      return err(reason(e));
    }
  }

  async function retryNow(id: string): Promise<Result<void>> {
    try {
      const [[, raw]] = await storage.getMany([keyFor(id)]);
      if (!raw) return err(`No entry ${id} in queue.`);
      const entry = JSON.parse(raw) as QueueEntry<TPayload>;
      await write({
        ...entry,
        status: "PENDING",
        leaseExpiresAt: null,
        nextAttemptAt: iso(clock()), // now!
      });
      return ok();
    } catch (e) {
      return err(reason(e));
    }
  }

  return { enqueue, list, runOnce, remove, retryNow };
}
