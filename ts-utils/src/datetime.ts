/** Confirm whether a value is an ISO-ish date string. */
export function isIsoDateString(v: unknown): v is string {
  if (typeof v !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(
    v,
  );
}

/**
 * Parse an ISO-ish date string to a timestamp (ms), for comparison/sorting.
 *
 * Returns `NaN` if `v` isn't a parseable ISO date string.
 */
export function parseIsoToTimestamp(v: unknown): number {
  if (!isIsoDateString(v)) return NaN;
  const ts = Date.parse(v as string);
  return Number.isFinite(ts) ? ts : NaN;
}

export interface FormatIsoDateOptions {
  /** Include the weekday name, e.g. "Wednesday". Default: false. */
  weekday?: boolean;
  /** Include the year, e.g. "2026". Default: true. */
  year?: boolean;
  /** Include a time component. Default: false. */
  time?: boolean;
  /** Include seconds in the time component. Only applies when `time` is true. Default: false. */
  seconds?: boolean;
  /** Use a 12-hour clock with am/pm instead of 24-hour. Default: false. */
  hour12?: boolean;
  /** BCP 47 locale tag. Default: "en-GB". */
  locale?: string;
}

/**
 * Format an ISO-ish timestamp string into a locale-aware, human-readable string.
 *
 * Returns `null` for empty or unparseable input, so callers decide their own
 * empty-state fallback, e.g. `formatIsoDate(x) ?? "-"`.
 */
export function formatIsoDate(
  iso: string | null | undefined,
  opts: FormatIsoDateOptions = {},
): string | null {
  if (!iso) return null;

  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  const {
    weekday = false,
    year = true,
    time = false,
    seconds = false,
    hour12 = false,
    locale = "en-GB",
  } = opts;

  const dateStr = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    ...(year ? { year: "numeric" as const } : {}),
    ...(weekday ? { weekday: "long" as const } : {}),
  }).format(d);

  if (!time) return dateStr;

  const timeStr = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    ...(seconds ? { second: "2-digit" as const } : {}),
    hour12,
  }).format(d);

  return `${dateStr}, ${timeStr}`;
}

export interface FormatRelativeTimeOptions {
  /** BCP 47 locale tag, used once the timestamp falls back to a plain date. Default: "en-GB". */
  locale?: string;
}

/**
 * Format an ISO-ish timestamp string as a short relative label, e.g.
 * "3m ago", "2h ago", "5d ago". Falls back to a plain date once older than
 * a week.
 *
 * Returns `null` for empty or unparseable input, so callers decide their
 * own empty-state fallback, e.g. `formatRelativeTime(x) ?? "-"`.
 */
export function formatRelativeTime(
  iso: string | null | undefined,
  opts: FormatRelativeTimeOptions = {},
): string | null {
  if (!iso) return null;

  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  const { locale = "en-GB" } = opts;
  const diffMs = Date.now() - d.getTime();

  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;

  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;

  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;

  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}
