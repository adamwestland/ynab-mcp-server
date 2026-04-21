import { z } from 'zod';
import { YnabTool } from '../base.js';
import { AutoSweepPositivesTool } from './autoSweepPositives.js';
import { AutoReduceOverfundedTool } from './autoReduceOverfunded.js';
import { AutoAssignUnderfundedTool } from './autoAssignUnderfunded.js';
import {
  BaseBudgetingInputSchema,
  loadBudgetingContext,
  type BaseBudgetingInput,
  type BudgetingContext,
  type BudgetingResult,
} from './shared.js';

export const BalanceMonthInputSchema = BaseBudgetingInputSchema.extend({
  reduce_overfunded: z.boolean().optional().default(true).describe('Run the reduce-overfunded phase between sweep and assign. Frees money stuck in over-funded categories (preserves prior-month carryover; skips goals). Default true. Set false to restore the original two-phase behavior.'),
});

export type BalanceMonthInput = z.infer<typeof BalanceMonthInputSchema>;

export interface BalanceMonthResult {
  phase: 'balance_month';
  dry_run: boolean;
  phases: BudgetingResult[];
  total_moved_milliunits: number;
}

/** Runs sweep-positives → reduce-overfunded → assign-underfunded in order.
 * Loads accounts + month once for the first phase, then re-fetches only
 * the month between phases (each PATCH set changes `budgeted`/`activity`
 * and the next phase needs fresh balances). The account list is reused
 * across phases to avoid redundant GET /accounts calls. */
export class AutoBalanceMonthTool extends YnabTool {
  name = 'ynab_auto_balance_month';
  description = 'Run sweep-positives, reduce-overfunded, then auto-assign-underfunded for a month in one call. Loads context once and reuses the account list across phases to conserve rate-limit budget. Pass reduce_overfunded:false to skip the middle phase. Supports dry_run.';
  inputSchema = BalanceMonthInputSchema;

  async execute(args: unknown): Promise<BalanceMonthResult> {
    const input = this.validateArgs<BalanceMonthInput>(args);

    try {
      const sweep = new AutoSweepPositivesTool(this.client);
      const reduce = new AutoReduceOverfundedTool(this.client);
      const assign = new AutoAssignUnderfundedTool(this.client);

      // Phase 1: sweep. One context load (month + accounts).
      const sweepCtx = await loadBudgetingContext(this.client, input);
      const sweepResult = await sweep.executeWithContext(input, sweepCtx);

      const phases: BudgetingResult[] = [sweepResult];

      // Phase 2 (optional): reduce overfunded. In live mode, re-fetch so
      // balances reflect the sweep PATCHes. In dry_run, simulate the sweep's
      // planned changes against the in-memory context — otherwise the same
      // category (e.g. a refund) shows up in both phases' details and inflates
      // the simulated totals.
      let nextCtx: BudgetingContext = sweepCtx;
      if (input.reduce_overfunded) {
        nextCtx = input.dry_run
          ? applyPlannedToContext(sweepCtx, sweepResult)
          : await loadMonthOnlyContext(this.client, input, sweepCtx.closedCcAccountNames);
        const reduceResult = await reduce.executeWithContext(input, nextCtx);
        phases.push(reduceResult);
      }

      // Phase 3: assign. Same dry_run treatment — simulate the prior phase's
      // planned changes forward.
      const lastPhaseResult = phases[phases.length - 1]!;
      const assignCtx = input.dry_run
        ? applyPlannedToContext(nextCtx, lastPhaseResult)
        : await loadMonthOnlyContext(this.client, input, sweepCtx.closedCcAccountNames);
      const assignResult = await assign.executeWithContext(input, assignCtx);
      phases.push(assignResult);

      return {
        phase: 'balance_month',
        dry_run: input.dry_run,
        phases,
        total_moved_milliunits: phases.reduce((s, p) => s + p.total_moved_milliunits, 0),
      };
    } catch (error) {
      this.handleError(error, 'auto-balance month');
    }
  }
}

/** Advance an in-memory context forward by applying a phase's planned
 * changes. Used for dry_run between phases — without this, every phase
 * sees the original pre-sweep state and the same category can appear in
 * multiple phases' planned details. */
function applyPlannedToContext(ctx: BudgetingContext, result: BudgetingResult): BudgetingContext {
  const deltaByCat = new Map<string, number>();
  for (const d of result.details) {
    if (d.status === 'planned' || d.status === 'applied') {
      deltaByCat.set(d.category_id, d.delta);
    }
  }
  if (deltaByCat.size === 0) return ctx;

  const updatedCategories = ctx.categories.map(c => {
    const delta = deltaByCat.get(c.id);
    if (delta === undefined || delta === 0) return c;
    return { ...c, budgeted: c.budgeted + delta, balance: c.balance + delta };
  });

  // RTA moves opposite to budgeted: +budgeted means -RTA.
  const totalBudgetedDelta = Array.from(deltaByCat.values()).reduce((s, d) => s + d, 0);

  return {
    ...ctx,
    categories: updatedCategories,
    toBeBudgetedBefore: ctx.toBeBudgetedBefore - totalBudgetedDelta,
  };
}

async function loadMonthOnlyContext(
  client: import('../../client/YNABClient.js').YNABClient,
  input: Pick<BaseBudgetingInput, 'budget_id' | 'month'>,
  closedCcAccountNames: string[]
): Promise<BudgetingContext> {
  const monthResponse = await client.getBudgetMonth(input.budget_id, input.month);
  return {
    month: monthResponse.month,
    categories: monthResponse.month.categories,
    closedCcAccountNames,
    toBeBudgetedBefore: monthResponse.month.to_be_budgeted,
  };
}
