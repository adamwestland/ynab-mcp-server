/**
 * YNAB reserves a handful of payee names for internal use (reconciliation
 * and manual balance adjustments). Creating a transaction with one of these
 * payee names via the API returns a generic "Bad request" error with no
 * indication that the payee name is the cause — see issue #11.
 *
 * This list is matched case-insensitively.
 */
const RESERVED_PAYEE_NAMES = [
  'Reconciliation Balance Adjustment',
  'Manual Balance Adjustment',
  'Starting Balance',
] as const;

/**
 * Throws a clear, actionable error if the supplied payee name is reserved
 * by YNAB. Safe to pass undefined/empty (no-op).
 */
export function assertPayeeNameAllowed(name: string | undefined | null): void {
  if (!name) return;
  const normalized = name.trim().toLowerCase();
  const match = RESERVED_PAYEE_NAMES.find(r => r.toLowerCase() === normalized);
  if (match) {
    throw new Error(
      `Payee name "${name}" is reserved by YNAB and cannot be set via the API. ` +
        `Reserved names: ${RESERVED_PAYEE_NAMES.join(', ')}. ` +
        `Consider a different payee name and noting the original in the memo.`
    );
  }
}

export { RESERVED_PAYEE_NAMES };
