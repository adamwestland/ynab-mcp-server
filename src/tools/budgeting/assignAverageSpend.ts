import { z } from 'zod';
import { YnabTool } from '../base.js';
import { filterCategories } from './categoryFilters.js';
import { applyBudgetChanges, type PlannedChange } from './categoryBudgetApplier.js';
import { priorMonths } from './monthMath.js';
import {
  BaseBudgetingInputSchema,
  buildFilterOptions,
  loadBudgetingContext,
  refreshToBeBudgeted,
  wrapAmount,
  type BudgetingResult,
} from './shared.js';

const AssignAverageSpendInputSchema = BaseBudgetingInputSchema.extend({
  lookback_months: z.number().int().min(1).max(12).optional().default(3)
    .describe('How many prior months to include in the rolling average. Defaults to 3.'),
});

type AssignAverageSpendInput = z.infer<typeof AssignAverageSpendInputSchema>;

interface AverageSpendResult extends BudgetingResult {
  lookback_used: number;
}

/** Assigns each category an amount equal to the rolling average of its
 * absolute outflow activity over the most recent `lookback_months`.
 * Positive activity (refunds) is ignored so the average reflects real
 * spending. Months where the category didn't exist or had no spending are
 * excluded from the denominator. */
export class AssignAverageSpendTool extends YnabTool {
  name = 'ynab_assign_average_spend';
  description = 'For each filtered category, set `budgeted` to the rolling average of absolute outflow activity over the most recent `lookback_months` (default 3). Supports dry_run.';
  inputSchema = AssignAverageSpendInputSchema;

  async execute(args: unknown): Promise<AverageSpendResult> {
    const input = this.validateArgs<AssignAverageSpendInput>(args);

    try {
      const ctx = await loadBudgetingContext(this.client, input);
      const months = priorMonths(input.month, input.lookback_months);

      const priorByMonth = new Map<string, Map<string, number>>();
      for (const m of months) {
        const resp = await this.client.getBudgetMonth(input.budget_id, m);
        const byId = new Map<string, number>(
          resp.month.categories.map(c => [c.id, c.activity])
        );
        priorByMonth.set(m, byId);
      }

      const filterOpts = buildFilterOptions(input, ctx.closedCcAccountNames);
      const { kept, skipped } = filterCategories(ctx.categories, filterOpts);

      let maxLookbackObserved = 0;
      const changes: PlannedChange[] = [];
      for (const cur of kept) {
        const outflows: number[] = [];
        for (const m of months) {
          const activity = priorByMonth.get(m)?.get(cur.id);
          if (activity === undefined) continue;
          if (activity >= 0) continue; // ignore refunds/income-into-category
          outflows.push(Math.abs(activity));
        }
        if (outflows.length === 0) continue;
        maxLookbackObserved = Math.max(maxLookbackObserved, outflows.length);
        const avg = Math.round(outflows.reduce((s, v) => s + v, 0) / outflows.length);
        if (avg === cur.budgeted) continue;
        changes.push({
          category_id: cur.id,
          category_name: cur.name,
          previous_budgeted: cur.budgeted,
          new_budgeted: avg,
          delta: avg - cur.budgeted,
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
        phase: 'assign_average_spend',
        dry_run: input.dry_run,
        categories_touched: result.applied,
        total_moved_milliunits: result.total_moved_milliunits,
        to_be_budgeted_before: { milliunits: ctx.toBeBudgetedBefore, formatted: this.formatCurrency(ctx.toBeBudgetedBefore) },
        to_be_budgeted_after: wrapAmount(toBeBudgetedAfter),
        skipped,
        details: result.details,
        failed: result.failed,
        lookback_used: maxLookbackObserved,
      };
    } catch (error) {
      this.handleError(error, 'assign average spend');
    }
  }
}
