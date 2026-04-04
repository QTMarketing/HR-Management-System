/**
 * Rows must be ordered newest-first (`clock_in_at` desc). Keeps each employee's first
 * occurrence = their latest punch.
 */
export function takeLatestPunchPerEmployee<T extends { employee_id: string }>(
  rowsOrderedNewestFirst: T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rowsOrderedNewestFirst) {
    if (seen.has(row.employee_id)) continue;
    seen.add(row.employee_id);
    out.push(row);
  }
  return out;
}
