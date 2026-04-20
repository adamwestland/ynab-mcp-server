import type { YnabAccount, YnabCategory } from '../../types/index.js';

/** YNAB account types that represent debt / credit-card-like accounts whose
 * closed instances should, by default, have their payment categories
 * excluded from batch budgeting. */
export const CLOSED_CC_ACCOUNT_TYPES = [
  'creditCard',
  'lineOfCredit',
  'otherDebt',
  'mortgage',
  'autoLoan',
  'studentLoan',
  'personalLoan',
  'medicalDebt',
] as const;

type ClosedCcAccountType = typeof CLOSED_CC_ACCOUNT_TYPES[number];

/** YNAB's internal category group housing "Inflow: Ready to Assign".
 * Categories in this group are never budgetable via batch tools. */
export const INTERNAL_MASTER_CATEGORY_GROUP = 'Internal Master Category';

/** Category group where YNAB auto-creates one payment category per
 * credit-card-like account. Closed-CC filtering only matches within this
 * group so an ordinary category that happens to share a name with a closed
 * account stays untouched. */
export const CREDIT_CARD_PAYMENTS_GROUP = 'Credit Card Payments';

export interface CategoryFilterOptions {
  /** If set, only these categories are considered (everything else is skipped as `not_included`). Matched by id or name (case-insensitive). */
  include?: string[];
  /** Categories matching any entry are skipped as `excluded`. Matched by id or name (case-insensitive). */
  exclude?: string[];
  /** Skip `hidden: true` categories. Defaults to true. */
  skip_hidden?: boolean;
  /** Skip `deleted: true` categories. Forced to true regardless of value (safety). */
  skip_deleted?: boolean;
  /** Names of accounts considered closed CC/debt. Categories in the Credit Card Payments group with matching names are skipped as `closed_cc`. */
  closed_cc_account_names?: string[];
  /** Skip categories that have a savings goal and carry a positive balance over from the previous month. Default false; sweep-style tools opt in. */
  skip_goal_carryover?: boolean;
}

export interface FilteredCategory {
  category_id: string;
  category_name: string;
  reason:
    | 'excluded'
    | 'not_included'
    | 'hidden'
    | 'deleted'
    | 'ready_to_assign'
    | 'closed_cc'
    | 'goal_carryover';
}

/** YNAB's balance equation for a given month: balance = prior_carryover + budgeted + activity.
 * Invert it to recover the rolled-over balance from last month. */
export function priorCarryover(category: YnabCategory): number {
  return category.balance - category.budgeted - category.activity;
}

export interface FilterResult {
  kept: YnabCategory[];
  skipped: FilteredCategory[];
}

export function getClosedCcAccountNames(accounts: YnabAccount[]): string[] {
  const debtTypes: Set<string> = new Set<ClosedCcAccountType>(CLOSED_CC_ACCOUNT_TYPES);
  return accounts
    .filter(a => a.closed && debtTypes.has(a.type))
    .map(a => a.name);
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function matchesAny(category: YnabCategory, list: string[] | undefined): boolean {
  if (!list || list.length === 0) return false;
  const normalized = list.map(normalize);
  return normalized.includes(normalize(category.id)) || normalized.includes(normalize(category.name));
}

export function filterCategories(
  categories: YnabCategory[],
  options: CategoryFilterOptions = {}
): FilterResult {
  const skipHidden = options.skip_hidden ?? true;
  const closedSet = new Set((options.closed_cc_account_names ?? []).map(normalize));

  const kept: YnabCategory[] = [];
  const skipped: FilteredCategory[] = [];

  for (const c of categories) {
    const entry = { category_id: c.id, category_name: c.name };

    if (c.deleted) {
      skipped.push({ ...entry, reason: 'deleted' });
      continue;
    }
    if (c.category_group_name === INTERNAL_MASTER_CATEGORY_GROUP) {
      skipped.push({ ...entry, reason: 'ready_to_assign' });
      continue;
    }
    if (matchesAny(c, options.exclude)) {
      skipped.push({ ...entry, reason: 'excluded' });
      continue;
    }
    if (skipHidden && c.hidden) {
      skipped.push({ ...entry, reason: 'hidden' });
      continue;
    }
    if (
      c.category_group_name === CREDIT_CARD_PAYMENTS_GROUP &&
      closedSet.has(normalize(c.name))
    ) {
      skipped.push({ ...entry, reason: 'closed_cc' });
      continue;
    }
    if (
      options.skip_goal_carryover &&
      c.goal_type != null &&
      priorCarryover(c) > 0
    ) {
      skipped.push({ ...entry, reason: 'goal_carryover' });
      continue;
    }
    if (options.include && options.include.length > 0 && !matchesAny(c, options.include)) {
      skipped.push({ ...entry, reason: 'not_included' });
      continue;
    }
    kept.push(c);
  }

  return { kept, skipped };
}
