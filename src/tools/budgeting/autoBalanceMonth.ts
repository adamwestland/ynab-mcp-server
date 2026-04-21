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

      // Phase 2 (optional): reduce overfunded. Refresh the month so balances
      // reflect the sweep PATCHes (unless dry_run). Reuses closed-CC names.
      let nextCtx: BudgetingContext = sweepCtx;
      if (input.reduce_overfunded) {
        nextCtx = input.dry_run
          ? sweepCtx
          : await loadMonthOnlyContext(this.client, input, sweepCtx.closedCcAccountNames);
        const reduceResult = await reduce.executeWithContext(input, nextCtx);
        phases.push(reduceResult);
      }

      // Phase 3: assign. Refresh again so balances reflect any reduce
      // PATCHes (unless dry_run, in which case the prior context is reused).
      const assignCtx = input.dry_run
        ? nextCtx
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
