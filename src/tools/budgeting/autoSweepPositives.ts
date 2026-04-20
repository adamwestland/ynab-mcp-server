import { YnabTool } from '../base.js';
import { filterCategories } from './categoryFilters.js';
import { applyBudgetChanges, type PlannedChange } from './categoryBudgetApplier.js';
import {
  BaseBudgetingInputSchema,
  buildFilterOptions,
  loadBudgetingContext,
  refreshToBeBudgeted,
  wrapAmount,
  type BaseBudgetingInput,
  type BudgetingResult,
} from './shared.js';

/** Mirrors the YNAB workflow of sweeping positive-activity inflows
 * (refunds, reimbursements, interest, etc.) back to Ready-to-Assign rather
 * than leaving them piled in the spending category.
 *
 * Categories with a savings goal AND a positive prior-month carryover are
 * preserved so in-flight savings aren't undone. */
export class AutoSweepPositivesTool extends YnabTool {
  name = 'ynab_auto_sweep_positives';
  description = 'Sweep positive activity (refunds, reimbursements, interest) back to Ready-to-Assign by reducing `budgeted` by `activity`. Skips categories with a savings goal that already carry a positive balance from last month. Supports dry_run.';
  inputSchema = BaseBudgetingInputSchema;

  async execute(args: unknown): Promise<BudgetingResult> {
    const input = this.validateArgs<BaseBudgetingInput>(args);

    try {
      const ctx = await loadBudgetingContext(this.client, input);
      const filterOpts = buildFilterOptions(input, ctx.closedCcAccountNames, { skip_goal_carryover: true });
      const { kept, skipped } = filterCategories(ctx.categories, filterOpts);

      const changes: PlannedChange[] = kept
        .filter(c => c.activity > 0)
        .map(c => ({
          category_id: c.id,
          category_name: c.name,
          previous_budgeted: c.budgeted,
          new_budgeted: c.budgeted - c.activity,
          delta: -c.activity,
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
        phase: 'sweep_positives',
        dry_run: input.dry_run,
        categories_touched: result.applied,
        total_moved_milliunits: result.total_moved_milliunits,
        to_be_budgeted_before: { milliunits: ctx.toBeBudgetedBefore, formatted: this.formatCurrency(ctx.toBeBudgetedBefore) },
        to_be_budgeted_after: wrapAmount(toBeBudgetedAfter),
        skipped,
        details: result.details,
        failed: result.failed,
      };
    } catch (error) {
      this.handleError(error, 'auto-sweep positives');
    }
  }
}
