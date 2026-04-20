import { z } from 'zod';
import type { YNABClient } from '../../client/YNABClient.js';
import type { YnabBudgetMonth, YnabCategory } from '../../types/index.js';
import {
  getClosedCcAccountNames,
  type CategoryFilterOptions,
  type FilterResult,
} from './categoryFilters.js';
import type { ApplyResult } from './categoryBudgetApplier.js';

export const BaseBudgetingInputSchema = z.object({
  budget_id: z.string().describe('The ID of the budget'),
  month: z.string().regex(/^\d{4}-\d{2}-01$/).describe('The budget month in YYYY-MM-01 format (first day of month)'),
  include_categories: z.array(z.string()).optional().describe('If set, only these categories are considered (matched by id or name, case-insensitive). Everything else is skipped.'),
  exclude_categories: z.array(z.string()).optional().describe('Categories to skip (matched by id or name, case-insensitive).'),
  skip_closed_cc_categories: z.boolean().optional().default(true).describe('Exclude Credit Card Payment categories whose matching CC/debt account is closed. Default true.'),
  skip_hidden: z.boolean().optional().default(true).describe('Exclude hidden categories. Default true.'),
  dry_run: z.boolean().optional().default(false).describe('Plan the changes without issuing any PATCHes. Default false.'),
});

export type BaseBudgetingInput = z.infer<typeof BaseBudgetingInputSchema>;

export interface BudgetingContext {
  month: YnabBudgetMonth;
  categories: YnabCategory[];
  closedCcAccountNames: string[];
  toBeBudgetedBefore: number;
}

/** Load the data every batch-budgeting tool needs: month data (categories,
 * to_be_budgeted) plus the account list used for closed-CC detection. */
export async function loadBudgetingContext(
  client: YNABClient,
  input: Pick<BaseBudgetingInput, 'budget_id' | 'month' | 'skip_closed_cc_categories'>
): Promise<BudgetingContext> {
  const monthResponse = await client.getBudgetMonth(input.budget_id, input.month);
  const month = monthResponse.month;

  let closedCcAccountNames: string[] = [];
  if (input.skip_closed_cc_categories) {
    const accountsResponse = await client.getAccounts(input.budget_id);
    closedCcAccountNames = getClosedCcAccountNames(accountsResponse.accounts);
  }

  return {
    month,
    categories: month.categories,
    closedCcAccountNames,
    toBeBudgetedBefore: month.to_be_budgeted,
  };
}

/** Build filter options from base input + tool-specific extras. */
export function buildFilterOptions(
  input: BaseBudgetingInput,
  closedCcAccountNames: string[],
  extra: Pick<CategoryFilterOptions, 'skip_goal_carryover'> = {}
): CategoryFilterOptions {
  const opts: CategoryFilterOptions = {
    skip_hidden: input.skip_hidden,
    closed_cc_account_names: input.skip_closed_cc_categories ? closedCcAccountNames : [],
    ...extra,
  };
  if (input.include_categories && input.include_categories.length > 0) {
    opts.include = input.include_categories;
  }
  if (input.exclude_categories && input.exclude_categories.length > 0) {
    opts.exclude = input.exclude_categories;
  }
  return opts;
}

export interface BudgetingResult {
  phase: string;
  dry_run: boolean;
  categories_touched: number;
  total_moved_milliunits: number;
  to_be_budgeted_before: { milliunits: number; formatted: string };
  to_be_budgeted_after: { milliunits: number; formatted: string } | null;
  skipped: FilterResult['skipped'];
  details: ApplyResult['details'];
  failed: ApplyResult['failed'];
}

/** Re-fetch `to_be_budgeted` after applying so callers get an authoritative
 * post-run figure. Skipped on dry_run. */
export async function refreshToBeBudgeted(
  client: YNABClient,
  budgetId: string,
  month: string,
  dryRun: boolean
): Promise<number | null> {
  if (dryRun) return null;
  const response = await client.getBudgetMonth(budgetId, month);
  return response.month.to_be_budgeted;
}

export function formatMilliunits(milliunits: number): string {
  const dollars = milliunits / 1000;
  return dollars < 0
    ? `-$${Math.abs(dollars).toFixed(2)}`
    : `$${dollars.toFixed(2)}`;
}

export function wrapAmount(milliunits: number | null): { milliunits: number; formatted: string } | null {
  if (milliunits === null) return null;
  return { milliunits, formatted: formatMilliunits(milliunits) };
}
