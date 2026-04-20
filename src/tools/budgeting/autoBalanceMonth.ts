import { YnabTool } from '../base.js';
import { AutoSweepPositivesTool } from './autoSweepPositives.js';
import { AutoAssignUnderfundedTool } from './autoAssignUnderfunded.js';
import { BaseBudgetingInputSchema, type BaseBudgetingInput, type BudgetingResult } from './shared.js';

export interface BalanceMonthResult {
  phase: 'balance_month';
  dry_run: boolean;
  phases: BudgetingResult[];
  total_moved_milliunits: number;
}

/** Runs sweep-positives then assign-underfunded in order. One tool call
 * handles a full monthly allocation (positive activity flows back to RTA,
 * then RTA funds every negative balance to zero). */
export class AutoBalanceMonthTool extends YnabTool {
  name = 'ynab_auto_balance_month';
  description = 'Run sweep-positives then auto-assign-underfunded for a month in one call. Returns both phases\' details. Supports dry_run.';
  inputSchema = BaseBudgetingInputSchema;

  async execute(args: unknown): Promise<BalanceMonthResult> {
    const input = this.validateArgs<BaseBudgetingInput>(args);

    try {
      const sweep = new AutoSweepPositivesTool(this.client);
      const assign = new AutoAssignUnderfundedTool(this.client);

      const sweepResult = await sweep.execute(input);
      const assignResult = await assign.execute(input);

      const phases = [sweepResult as BudgetingResult, assignResult as BudgetingResult];

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
