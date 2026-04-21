import { YnabTool } from '../base.js';
import { filterCategories, priorCarryover } from './categoryFilters.js';
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

/** Frees money stuck in overfunded categories — the symmetrical counterpart
 * to AutoSweepPositives. After re-categorizing transactions out of a
 * category (e.g. moving spend from "Other" into more specific categories),
 * the original category is left over-funded relative to its now-tiny
 * activity. This tool reduces `budgeted` so the surplus returns to RTA,
 * while preserving any prior-month carryover (treated as savings) and
 * skipping every category with a goal. */
export class AutoReduceOverfundedTool extends YnabTool {
  name = 'ynab_auto_reduce_overfunded';
  description = 'Reduce `budgeted` for over-funded categories so excess returns to Ready-to-Assign. Frees the portion above prior-month carryover. Skips categories with goals, closed CC payment categories, hidden, and deleted categories. Supports dry_run.';
  inputSchema = BaseBudgetingInputSchema;

  async execute(args: unknown): Promise<BudgetingResult> {
    const input = this.validateArgs<BaseBudgetingInput>(args);
    try {
      const ctx = await loadBudgetingContext(this.client, input);
      return await this.executeWithContext(input, ctx);
    } catch (error) {
      this.handleError(error, 'auto-reduce overfunded');
    }
  }

  /** Execute against a caller-supplied context; used by AutoBalanceMonth.
   * Errors are NOT caught here — the outer `execute()` or the composing
   * tool owns error wrapping so we don't double-wrap messages. */
  async executeWithContext(input: BaseBudgetingInput, ctx: BudgetingContext): Promise<BudgetingResult> {
    const filterOpts = buildFilterOptions(input, ctx.closedCcAccountNames, { skip_goals: true });
    const { kept, skipped } = filterCategories(ctx.categories, filterOpts);

    const changes: PlannedChange[] = kept
      .map(c => {
        const carryover = priorCarryover(c);
        const protectedFloor = Math.max(0, carryover);
        const excess = c.balance - protectedFloor;
        if (excess <= 0) return null;
        // Never drive `budgeted` below zero. A refund (positive activity)
        // can push balance above budgeted; that surplus belongs to
        // sweep_positives, not here. Clamp so standalone use is safe.
        const newBudgeted = Math.max(0, c.budgeted - excess);
        const actualDelta = newBudgeted - c.budgeted;
        if (actualDelta === 0) return null;
        return {
          category_id: c.id,
          category_name: c.name,
          previous_budgeted: c.budgeted,
          new_budgeted: newBudgeted,
          delta: actualDelta,
        } as PlannedChange;
      })
      .filter((change): change is PlannedChange => change !== null);

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
      phase: 'reduce_overfunded',
      dry_run: input.dry_run,
      categories_touched: result.applied,
      total_moved_milliunits: result.total_moved_milliunits,
      to_be_budgeted_before: formatAmount(ctx.toBeBudgetedBefore),
      to_be_budgeted_after: wrapAmount(toBeBudgetedAfter),
      skipped,
      details: result.details,
      failed: result.failed,
    };
  }
}
