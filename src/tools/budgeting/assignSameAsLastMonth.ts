import { YnabTool } from '../base.js';
import { filterCategories } from './categoryFilters.js';
import { applyBudgetChanges, type PlannedChange } from './categoryBudgetApplier.js';
import { previousMonth } from './monthMath.js';
import {
  BaseBudgetingInputSchema,
  buildFilterOptions,
  loadBudgetingContext,
  refreshToBeBudgeted,
  wrapAmount,
  type BaseBudgetingInput,
  type BudgetingResult,
} from './shared.js';

/** Mirrors YNAB's "Assign Same as Last Month" by copying the prior month's
 * `budgeted` amount into every category of the target month. Categories
 * that didn't exist last month are skipped. */
export class AssignSameAsLastMonthTool extends YnabTool {
  name = 'ynab_assign_same_as_last_month';
  description = 'For each filtered category, set `budgeted` to the same amount as the previous month. Categories that did not exist last month are skipped. Supports dry_run.';
  inputSchema = BaseBudgetingInputSchema;

  async execute(args: unknown): Promise<BudgetingResult> {
    const input = this.validateArgs<BaseBudgetingInput>(args);

    try {
      const ctx = await loadBudgetingContext(this.client, input);
      const prevMonth = previousMonth(input.month);
      const prevResponse = await this.client.getBudgetMonth(input.budget_id, prevMonth);
      const prevById = new Map(prevResponse.month.categories.map(c => [c.id, c]));

      const filterOpts = buildFilterOptions(input, ctx.closedCcAccountNames);
      const { kept, skipped } = filterCategories(ctx.categories, filterOpts);

      const changes: PlannedChange[] = [];
      for (const cur of kept) {
        const prev = prevById.get(cur.id);
        if (!prev) {
          // Treat "new this month" as excluded so the caller can see why it wasn't touched.
          skipped.push({ category_id: cur.id, category_name: cur.name, reason: 'excluded' });
          continue;
        }
        changes.push({
          category_id: cur.id,
          category_name: cur.name,
          previous_budgeted: cur.budgeted,
          new_budgeted: prev.budgeted,
          delta: prev.budgeted - cur.budgeted,
        });
      }

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
        phase: 'assign_same_as_last_month',
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
      this.handleError(error, 'assign same as last month');
    }
  }
}
