/** Return the YNAB month string for the month immediately before the given
 * YYYY-MM-01 value. Handles the January wrap-around. */
export function previousMonth(month: string): string {
  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const m = Number(monthStr);
  if (m === 1) return `${year - 1}-12-01`;
  return `${year}-${String(m - 1).padStart(2, '0')}-01`;
}

/** Produce the N months preceding `month` (exclusive), in chronological order. */
export function priorMonths(month: string, count: number): string[] {
  const result: string[] = [];
  let cursor = month;
  for (let i = 0; i < count; i += 1) {
    cursor = previousMonth(cursor);
    result.unshift(cursor);
  }
  return result;
}
