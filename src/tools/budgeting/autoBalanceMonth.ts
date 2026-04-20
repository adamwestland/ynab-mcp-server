import { YnabTool } from '../base.js';
import { AutoSweepPositivesTool } from './autoSweepPositives.js';
import { AutoAssignUnderfundedTool } from './autoAssignUnderfunded.js';
import {
  BaseBudgetingInputSchema,
  loadBudgetingContext,
  type BaseBudgetingInput,
  type BudgetingContext,
  type BudgetingResult,
} from './shared.js';

export interface BalanceMonthResult {
  phase: 'balance_month';
  dry_run: boolean;
  phases: BudgetingResult[];
  total_moved_milliunits: number;
}

/** Runs sweep-positives then assign-underfunded in order. Loads accounts +
 * month once for the sweep phase, then re-fetches only the month between
 * phases (the PATCHes in sweep change `budgeted`/`activity` and the assign
 * phase needs fresh balances). The account list is reused across phases to
 * avoid a redundant GET /accounts call. */
export class AutoBalanceMonthTool extends YnabTool {
  name = 'ynab_auto_balance_month';
  description = 'Run sweep-positives then auto-assign-underfunded for a month in one call. Loads context once and reuses the account list across phases to conserve rate-limit budget. Supports dry_run.';
  inputSchema = BaseBudgetingInputSchema;

  async execute(args: unknown): Promise<BalanceMonthResult> {
    const input = this.validateArgs<BaseBudgetingInput>(args);

    try {
      const sweep = new AutoSweepPositivesTool(this.client);
      const assign = new AutoAssignUnderfundedTool(this.client);

      // Phase 1: sweep. One context load (month + accounts).
      const sweepCtx = await loadBudgetingContext(this.client, input);
      const sweepResult = await sweep.executeWithContext(input, sweepCtx);

      // Phase 2: assign. Reuse the closed-CC account names from phase 1 —
      // closed status doesn't change mid-run — but refresh the month so
      // balances reflect the sweep PATCHes we just issued (unless dry_run).
      const assignCtx = input.dry_run
        ? sweepCtx
        : await loadMonthOnlyContext(this.client, input, sweepCtx.closedCcAccountNames);
      const assignResult = await assign.executeWithContext(input, assignCtx);

      const phases = [sweepResult, assignResult];
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
