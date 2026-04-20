import type { YNABClient } from '../../client/YNABClient.js';
import { YNABError } from '../../client/ErrorHandler.js';

/** YNAB rejects "Inflow: Ready to Assign" on credit-card-like account
 * transactions because CC accounts have their own Credit Card Payment
 * category model. The API's response is a generic "Bad request" with no
 * pointer to the category. Issue #11 (payees) took the same approach for
 * reserved names; this module does the analogue for a semantically
 * incompatible category. */
export const CC_INCOMPATIBLE_CATEGORY_HINT =
  '"Inflow: Ready to Assign" is not valid for credit card accounts. ' +
  'Use a Credit Card Payment category (in the "Credit Card Payments" group) for payments, ' +
  'or leave category_id null for refunds/credits on a credit card.';

const DEBT_LIKE_ACCOUNT_TYPES = new Set<string>([
  'creditCard',
  'lineOfCredit',
  'otherDebt',
  'mortgage',
  'autoLoan',
  'studentLoan',
  'personalLoan',
  'medicalDebt',
]);

/** YNAB's internal category group housing "Inflow: Ready to Assign" and
 * its siblings. Matches the constant used by the budgeting tools. */
const INTERNAL_MASTER_CATEGORY_GROUP = 'Internal Master Category';

function isBadRequest(err: unknown): boolean {
  return (
    err instanceof YNABError &&
    (err.type === 'validation' || err.statusCode === 400)
  );
}

/** Inspect a failed create/update call and, if the underlying cause is the
 * "Inflow: Ready to Assign" category being used against a credit-card
 * account, return a replacement error with a clear hint. Otherwise return
 * the original error unchanged.
 *
 * This only runs on the failure path (2 extra GETs in the worst case),
 * so the happy path pays no overhead. */
export async function maybeEnrichCcInflowError(
  client: YNABClient,
  err: unknown,
  budgetId: string,
  accountId: string,
  categoryId: string | null | undefined
): Promise<Error> {
  const original = err instanceof Error ? err : new Error(String(err));
  if (!categoryId) return original;
  if (!isBadRequest(err)) return original;

  try {
    const [account, categoryResponse] = await Promise.all([
      client.getAccount(budgetId, accountId),
      client.getCategory(budgetId, categoryId),
    ]);
    const accountType = account?.type ?? '';
    const groupName = categoryResponse?.category?.category_group_name ?? '';
    if (
      DEBT_LIKE_ACCOUNT_TYPES.has(accountType) &&
      groupName === INTERNAL_MASTER_CATEGORY_GROUP
    ) {
      return new Error(CC_INCOMPATIBLE_CATEGORY_HINT);
    }
  } catch {
    // Enrichment failed (offline, rate-limited, etc.) — fall through
    // to the original error rather than masking it.
  }
  return original;
}
