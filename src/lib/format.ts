/**
 * Deterministic UTC formatting for a report's `fetchedAt` value. Avoids
 * locale-dependent output so server-rendered HTML and client hydration agree.
 */
export function formatFetchedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
