import { err, ok, Result } from "../../ts-utils/src";
import { isDue, isLeaseExpired } from "./schedule";
import { Clock, QueueStorage } from "./storage";
import { QueueConfig, QueueEntry, RunSummary, UploadResult } from "./types";

export interface QueueCore<TPayload> {
  /** Takes custody of `payload`. `ok` holds the entry id. */
  enqueue(
    payload: TPayload,
    options?: { skipIfPresent?: boolean },
  ): Promise<Result<string>>;
  list(): Promise<Result<ReadonlyArray<QueueEntry<TPayload>>>>;
  /** Kill lapsed leases -> claim what is due, upload it, record the outcome. */
  runOnce(): Promise<Result<RunSummary>>;
  /**
   * Runs passes back to back while they make progress, so a long queue on a
   * good connection doesn't wait out a timer between batches. `ok` holds the
   * passes' combined summary.
   */
  drain(options?: DrainOptions): Promise<Result<RunSummary>>;
  remove(id: string): Promise<Result<void>>;
  /** Return a `DEAD` or `FAILED` entry to the front of the queue. */
  retryNow(id: string, resetAttempts?: boolean): Promise<Result<void>>;
}

export interface DrainOptions {
  /**
   * Backstop on how much one drain does: at most this many slots' worth of
   * uploads (passes × concurrency) are started. Default 50.
   */
  readonly maxPasses?: number;
  /**
   * Asked before each new upload, except those filling the first slots.
   * Return `false` to stop starting more - when the connection drops, say, or
   * a background window is closing. Uploads already started still finish.
   */
  readonly shouldContinue?: () => boolean | Promise<boolean>;
  /**
   * Called as uploads finish - after each slot's worth, and once at the end -
   * with what happened since the last call. E.g. to refresh a UI mirror.
   */
  readonly afterPass?: (summary: RunSummary) => void | Promise<void>;
}

const EMPTY_SUMMARY: RunSummary = {
  claimed: 0,
  succeeded: 0,
  failed: 0,
  died: 0,
  reclaimed: 0,
};

const addSummaries = (a: RunSummary, b: RunSummary): RunSummary => ({
  claimed: a.claimed + b.claimed,
  succeeded: a.succeeded + b.succeeded,
  failed: a.failed + b.failed,
  died: a.died + b.died,
  reclaimed: a.reclaimed + b.reclaimed,
});

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

  async function enqueue(
    payload: TPayload,
    options: { skipIfPresent?: boolean } = {},
  ): Promise<Result<string>> {
    const id = config.getId(payload);
    const now = clock();

    try {
      if (options.skipIfPresent) {
        const [[, existing]] = await storage.getMany([keyFor(id)]);
        if (existing) return ok(id);
      }
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

  /**
   * Lease extension for one claimed entry.
   *
   * Extensions are chained, so they land in order, and `settle` waits for the
   * last before shutting the door on any more.
   */
  function leaseExtender(id: string): {
    extend: () => Promise<void>;
    settle: () => Promise<void>;
  } {
    let settled = false;
    let chain: Promise<void> = Promise.resolve();

    const extendOnce = async () => {
      if (settled) return;
      const [[, raw]] = await storage.getMany([keyFor(id)]);
      // removed by the user mid-upload, or reclaimed after all
      if (!raw || settled) return;
      const current = JSON.parse(raw) as QueueEntry<TPayload>;
      if (current.status !== "IN_FLIGHT") return;
      await write({
        ...current,
        leaseExpiresAt: iso(clock() + config.leaseMs),
      });
    };

    return {
      extend: () => {
        chain = chain.then(extendOnce).catch((e) => {
          console.warn(`[${config.name}] Lease extension failed:`, reason(e));
        });
        return chain;
      },
      settle: async () => {
        settled = true;
        await chain;
      },
    };
  }

  /**
   * Revives entries whose lease has lapsed: the worker holding them died,
   * which isn't the upload failing, so attempts are left alone.
   *
   * @returns Everything stored, after reviving, and how many were revived.
   */
  async function reclaimExpired(
    now: number,
  ): Promise<{ entries: QueueEntry<TPayload>[]; reclaimed: number }> {
    let reclaimed = 0;
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
        reclaimed++;
      } else {
        entries.push(entry);
      }
    }
    return { entries, reclaimed };
  }

  /** Waiting entries that may be tried now, oldest first. */
  const dueEntries = (entries: QueueEntry<TPayload>[], now: number) =>
    entries
      .filter(
        (e) =>
          (e.status === "PENDING" || e.status === "FAILED") &&
          isDue(e.nextAttemptAt, now),
      )
      .sort((a, b) => a.enqueuedAt.localeCompare(b.enqueuedAt));

  const currentLimit = async () =>
    typeof config.concurrency === "function"
      ? await config.concurrency()
      : config.concurrency;

  /** Leases an entry to this worker. */
  async function claim(
    entry: QueueEntry<TPayload>,
    now: number,
  ): Promise<QueueEntry<TPayload>> {
    const leased = {
      ...entry,
      status: "IN_FLIGHT" as const,
      leaseExpiresAt: iso(now + config.leaseMs),
    };
    await write(leased);
    return leased;
  }

  /** Calls `prepare`, which must never stop the uploads it's preparing. */
  async function prepare(entries: QueueEntry<TPayload>[]): Promise<void> {
    if (entries.length === 0 || !config.prepare) return;
    try {
      await config.prepare(entries.map((e) => e.payload));
    } catch (e) {
      console.warn(`[${config.name}] prepare failed:`, reason(e));
    }
  }

  /**
   * Uploads one claimed entry and records how it went: removed on success,
   * otherwise FAILED with backoff, or DEAD once out of attempts or refused
   * for good. Only rejects if storage does.
   */
  async function uploadClaimed(
    entry: QueueEntry<TPayload>,
  ): Promise<"succeeded" | "failed" | "died"> {
    const lease = leaseExtender(entry.id);
    let result: UploadResult<TResult>;
    try {
      result = await config.upload(entry.payload, {
        extendLease: lease.extend,
      });
    } catch (e) {
      // a transport that throws - fetch on a dropped connection, say - must
      // fail this entry only, not the whole drain
      result = err({ message: reason(e), retryable: true });
    }
    // no extension may land after this, or it would resurrect an entry the
    // outcome below removes or settles
    await lease.settle();

    if (result.ok) {
      await storage.remove([keyFor(entry.id)]);
      await config.onSuccess?.(entry.payload, result.value);
      return "succeeded";
    }

    // attempts increment on failure, not on claim, so a process killed
    // mid-upload costs nothing.
    const attempts = entry.attempts + 1;
    const isDead = !result.error.retryable || attempts >= config.maxAttempts;

    await write({
      ...entry,
      status: isDead ? "DEAD" : "FAILED",
      attempts,
      leaseExpiresAt: null,
      lastError: result.error,
      nextAttemptAt: iso(clock() + (isDead ? 0 : config.backoffMs(attempts))),
    });

    if (isDead) {
      await config.onDead?.(entry.payload, result.error);
      return "died";
    }
    return "failed";
  }

  const countOutcome = (
    summary: RunSummary,
    outcome: "succeeded" | "failed" | "died",
  ): RunSummary => ({ ...summary, [outcome]: summary[outcome] + 1 });

  async function runOnce(): Promise<Result<RunSummary>> {
    try {
      const now = clock();
      const { entries, reclaimed } = await reclaimExpired(now);

      const inFlight = entries.filter((e) => e.status === "IN_FLIGHT").length;
      const slots = Math.max(0, (await currentLimit()) - inFlight);

      const claimed: QueueEntry<TPayload>[] = [];
      for (const entry of dueEntries(entries, now).slice(0, slots)) {
        claimed.push(await claim(entry, now));
      }

      await prepare(claimed);

      const outcomes = await Promise.all(claimed.map(uploadClaimed));
      return ok(
        outcomes.reduce(countOutcome, {
          ...EMPTY_SUMMARY,
          claimed: claimed.length,
          reclaimed,
        }),
      );
    } catch (e) {
      return err(reason(e));
    }
  }

  /**
   * Uploads with every slot kept busy: as soon as one upload finishes the
   * next starts, rather than each batch waiting for its slowest upload. On a
   * patchy connection one stalled photo no longer idles the other slots.
   *
   * Stops starting new uploads when:
   * - nothing more is due (re-reading storage first, for anything queued
   *   meanwhile);
   * - the connection looks to be failing: after a failure nothing new starts
   *   until an upload succeeds, and once all in flight have failed it hands
   *   back. A permanent refusal (DEAD) says nothing about the link, so
   *   doesn't count;
   * - `shouldContinue` says so (asked before each new upload, except those
   *   filling the first slots);
   * - `maxPasses` × slots uploads have started, as a backstop.
   *
   * Uploads already started always finish and are recorded.
   */
  async function drain(
    options: DrainOptions = {},
  ): Promise<Result<RunSummary>> {
    const { maxPasses = 50, shouldContinue, afterPass } = options;
    let total = EMPTY_SUMMARY;
    // reported to afterPass since it was last called
    let unreported = EMPTY_SUMMARY;
    let finishedSinceReport = 0;

    const active = new Set<Promise<void>>();
    const mine = new Set<string>();
    const prepared = new Set<string>();
    let candidates: QueueEntry<TPayload>[] = [];
    // in flight with someone else, e.g. the background worker
    let othersInFlight = 0;
    let isCandidateListFresh = false;
    let failuresSinceSuccess = 0;
    let started = 0;
    let maxStarts: number | null = null;
    let limit = 0;
    let isStopping = false;

    const record = (summary: RunSummary) => {
      total = addSummaries(total, summary);
      unreported = addSummaries(unreported, summary);
    };

    const readCandidates = async () => {
      const now = clock();
      const { entries, reclaimed } = await reclaimExpired(now);
      record({ ...EMPTY_SUMMARY, reclaimed });
      othersInFlight = entries.filter(
        (e) => e.status === "IN_FLIGHT" && !mine.has(e.id),
      ).length;
      candidates = dueEntries(entries, now).filter((e) => !mine.has(e.id));
      isCandidateListFresh = true;
    };

    /** Starts the next candidate still due, if any. */
    const startNext = async (): Promise<boolean> => {
      while (candidates.length > 0) {
        const next = candidates.shift() as QueueEntry<TPayload>;
        // The list can be stale: removed by the user, or claimed by another
        // worker since it was read
        const [[, raw]] = await storage.getMany([keyFor(next.id)]);
        if (!raw) continue;
        const stored = JSON.parse(raw) as QueueEntry<TPayload>;
        const now = clock();
        if (
          (stored.status !== "PENDING" && stored.status !== "FAILED") ||
          !isDue(stored.nextAttemptAt, now)
        ) {
          continue;
        }

        // Prepared a few ahead, so e.g. upload URLs are fetched in batches
        // but not so far ahead that they expire before they're used
        if (config.prepare && !prepared.has(next.id)) {
          const ahead = [next, ...candidates.slice(0, Math.max(limit, 1) * 2)];
          for (const entry of ahead) prepared.add(entry.id);
          await prepare(ahead);
        }

        const leased = await claim(
          { ...next, attempts: stored.attempts, status: stored.status },
          now,
        );
        mine.add(leased.id);
        started++;
        record({ ...EMPTY_SUMMARY, claimed: 1 });

        const running: Promise<void> = uploadClaimed(leased)
          .then((outcome) => {
            record(countOutcome(EMPTY_SUMMARY, outcome));
            finishedSinceReport++;
            if (outcome === "succeeded") failuresSinceSuccess = 0;
            else if (outcome === "failed") failuresSinceSuccess++;
          })
          .finally(() => {
            mine.delete(leased.id);
            active.delete(running);
          });
        active.add(running);
        return true;
      }
      return false;
    };

    const report = async () => {
      const summary = unreported;
      unreported = EMPTY_SUMMARY;
      finishedSinceReport = 0;
      await afterPass?.(summary);
    };

    try {
      await readCandidates();
      let isFirstFill = true;

      for (;;) {
        // Fill free slots, unless the link looks to be failing
        if (!isStopping && failuresSinceSuccess === 0) {
          limit = await currentLimit();
          maxStarts ??= maxPasses * Math.max(limit, 1);
          while (active.size + othersInFlight < limit && started < maxStarts) {
            if (!isFirstFill && shouldContinue && !(await shouldContinue())) {
              isStopping = true;
              break;
            }
            if (candidates.length === 0) {
              // anything queued since the last read?
              if (isCandidateListFresh) break;
              await readCandidates();
              continue;
            }
            if (!(await startNext())) continue;
            isCandidateListFresh = false;
          }
          isFirstFill = false;
        }

        if (active.size === 0) break;
        await Promise.race(active);
        // Something finished, so what's queued may have changed (a report
        // succeeding queues its photos)
        if (candidates.length === 0) isCandidateListFresh = false;
        // Refresh observers about as often as one pass used to
        if (finishedSinceReport >= Math.max(limit, 1)) await report();
      }

      if (finishedSinceReport > 0 || total.claimed === 0) await report();
      return ok(total);
    } catch (e) {
      // let anything started finish and be recorded before handing back
      await Promise.allSettled(active);
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

  async function retryNow(
    id: string,
    resetAttempts = false,
  ): Promise<Result<void>> {
    try {
      const [[, raw]] = await storage.getMany([keyFor(id)]);
      if (!raw) return err(`No entry ${id} in queue.`);
      const entry = JSON.parse(raw) as QueueEntry<TPayload>;
      await write({
        ...entry,
        status: "PENDING",
        leaseExpiresAt: null,
        attempts: resetAttempts ? 0 : entry.attempts,
        nextAttemptAt: iso(clock()), // now!
      });
      return ok();
    } catch (e) {
      return err(reason(e));
    }
  }

  return { enqueue, list, runOnce, drain, remove, retryNow };
}
