/**
 * Derive up to two initials from a display name, e.g. "John Smith" -> "JS".
 *
 * Returns "?" for empty/whitespace-only input.
 */
export function getInitials(displayName: string | null | undefined): string {
  if (!displayName) return "?";

  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return initials || "?";
}
