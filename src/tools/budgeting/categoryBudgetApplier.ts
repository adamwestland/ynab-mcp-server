import type { YNABClient } from '../../client/YNABClient.js';

/** A single pending change describing how one category's monthly `budgeted`
 * should move. Produced by the planning stage of every batch budgeting tool
 * and consumed here. */
export interface PlannedChange {
  category_id: string;
  category_name: string;
  previous_budgeted: number;
  new_budgeted: number;
  delta: number;
}

export interface AppliedChange extends PlannedChange {
  status: 'applied' | 'planned' | 'skipped_noop' | 'failed';
  error?: string;
}

export interface ApplyResult {
  applied: number;
  failed: Array<{ category_id: string; category_name: string; error: string }>;
  total_moved_milliunits: number;
  details: AppliedChange[];
}

export interface ApplyOptions {
  /** If true, the planned changes are returned but no PATCHes are issued. */
  dry_run?: boolean;
}

/** Apply a list of planned `budgeted` changes sequentially. Per-category
 * failures are captured and reporting continues so a transient 500 on one
 * category doesn't abort the rest of the monthly run. */
export async function applyBudgetChanges(
  client: YNABClient,
  budgetId: string,
  month: string,
  changes: PlannedChange[],
  options: ApplyOptions = {}
): Promise<ApplyResult> {
  const details: AppliedChange[] = [];
  const failed: ApplyResult['failed'] = [];
  let applied = 0;
  let totalMoved = 0;

  for (const change of changes) {
    if (change.delta === 0) {
      details.push({ ...change, status: 'skipped_noop' });
      continue;
    }

    if (options.dry_run) {
      details.push({ ...change, status: 'planned' });
      applied += 1;
      totalMoved += Math.abs(change.delta);
      continue;
    }

    try {
      await client.updateCategoryBudget(budgetId, change.category_id, month, change.new_budgeted);
      details.push({ ...change, status: 'applied' });
      applied += 1;
      totalMoved += Math.abs(change.delta);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      details.push({ ...change, status: 'failed', error: message });
      failed.push({
        category_id: change.category_id,
        category_name: change.category_name,
        error: message,
      });
    }
  }

  return { applied, failed, total_moved_milliunits: totalMoved, details };
}
