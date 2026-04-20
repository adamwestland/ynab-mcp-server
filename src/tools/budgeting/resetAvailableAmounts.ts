import { YnabTool } from '../base.js';
import { filterCategories } from './categoryFilters.js';
import { applyBudgetChanges, type PlannedChange } from './categoryBudgetApplier.js';
import {
  BaseBudgetingInputSchema,
  buildFilterOptions,
  loadBudgetingContext,
  refreshToBeBudgeted,
  wrapAmount,
  formatAmount,
  type BaseBudgetingInput,
  type BudgetingResult,
} from './shared.js';

/** Mirrors YNAB's "Reset Available Amounts": set every category's balance
 * to exactly $0 for the month. Positive balances flow back to RTA; negative
 * balances are covered from RTA. Net change per category = -balance. */
export class ResetAvailableAmountsTool extends YnabTool {
  name = 'ynab_reset_available_amounts';
  description = 'Set every filtered category\'s balance to $0 for the month by adjusting budgeted by -balance. Mirrors YNAB\'s "Reset Available Amounts". Supports dry_run.';
  inputSchema = BaseBudgetingInputSchema;

  async execute(args: unknown): Promise<BudgetingResult> {
    const input = this.validateArgs<BaseBudgetingInput>(args);

    try {
      const ctx = await loadBudgetingContext(this.client, input);
      const filterOpts = buildFilterOptions(input, ctx.closedCcAccountNames);
      const { kept, skipped } = filterCategories(ctx.categories, filterOpts);

      const changes: PlannedChange[] = kept
        .filter(c => c.balance !== 0)
        .map(c => ({
          category_id: c.id,
          category_name: c.name,
          previous_budgeted: c.budgeted,
          new_budgeted: c.budgeted - c.balance,
          delta: -c.balance,
        }));

      const result = await applyBudgetChanges(
        this.client,
        input.budget_id,
        input.month,
        changes,
        { dry_run: input.dry_run }
      );

      const toBeBudgetedAfter = await refreshToBeBudgeted(
        this.client,
        input.budget_id,
        input.month,
        input.dry_run
      );

      return {
        phase: 'reset_available_amounts',
        dry_run: input.dry_run,
        categories_touched: result.applied,
        total_moved_milliunits: result.total_moved_milliunits,
        to_be_budgeted_before: formatAmount(ctx.toBeBudgetedBefore),
        to_be_budgeted_after: wrapAmount(toBeBudgetedAfter),
        skipped,
        details: result.details,
        failed: result.failed,
      };
    } catch (error) {
      this.handleError(error, 'reset available amounts');
    }
  }
}
