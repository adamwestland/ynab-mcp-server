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
  type BudgetingContext,
  type BudgetingResult,
} from './shared.js';

/** Mirrors YNAB's "Auto-Assign → Underfunded" button: every category whose
 * month-balance is negative is funded with exactly enough to bring balance
 * back to $0. */
export class AutoAssignUnderfundedTool extends YnabTool {
  name = 'ynab_auto_assign_underfunded';
  description = 'Fund every category with a negative month-balance to exactly $0. Mirrors YNAB\'s "Auto-Assign: Underfunded" button. Closed credit-card payment categories are excluded by default. Supports dry_run for previewing.';
  inputSchema = BaseBudgetingInputSchema;

  async execute(args: unknown): Promise<BudgetingResult> {
    const input = this.validateArgs<BaseBudgetingInput>(args);
    try {
      const ctx = await loadBudgetingContext(this.client, input);
      return await this.executeWithContext(input, ctx);
    } catch (error) {
      this.handleError(error, 'auto-assign underfunded');
    }
  }

  /** Execute against a caller-supplied context. Lets compositions like
   * AutoBalanceMonth reuse one context load across phases. */
  async executeWithContext(input: BaseBudgetingInput, ctx: BudgetingContext): Promise<BudgetingResult> {
    try {
      const filterOpts = buildFilterOptions(input, ctx.closedCcAccountNames);
      const { kept, skipped } = filterCategories(ctx.categories, filterOpts);

      const changes: PlannedChange[] = kept
        .filter(c => c.balance < 0)
        .map(c => ({
          category_id: c.id,
          category_name: c.name,
          previous_budgeted: c.budgeted,
          new_budgeted: c.budgeted + Math.abs(c.balance),
          delta: Math.abs(c.balance),
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
        phase: 'assign_underfunded',
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
      this.handleError(error, 'auto-assign underfunded');
    }
  }
}
