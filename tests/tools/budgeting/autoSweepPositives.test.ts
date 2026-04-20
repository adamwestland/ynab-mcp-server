import { describe, it, expect, beforeEach } from 'vitest';
import { AutoSweepPositivesTool } from '../../../src/tools/budgeting/autoSweepPositives.js';
import { createMockClient, type MockYNABClient } from '../../helpers/mockClient.js';
import { createMockCategory } from '../../helpers/fixtures.js';

function monthResponse(categories: any[], to_be_budgeted = 0) {
  return {
    month: {
      month: '2024-01-01', note: null, income: 0, budgeted: 0, activity: 0,
      to_be_budgeted, age_of_money: null, deleted: false, categories,
    },
    server_knowledge: 1,
  };
}

describe('AutoSweepPositivesTool', () => {
  let client: MockYNABClient;
  let tool: AutoSweepPositivesTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new AutoSweepPositivesTool(client as any);
  });

  it('sweeps each category with positive activity back to RTA', async () => {
    const refund = createMockCategory({
      id: 'c-refund', name: 'Amazon', category_group_name: 'Shopping',
      budgeted: 0, activity: 15000, balance: 15000,
    });
    const spend = createMockCategory({
      id: 'c-spend', name: 'Food', category_group_name: 'Spending',
      budgeted: 50000, activity: -30000, balance: 20000,
    });
    client.getBudgetMonth.mockResolvedValue(monthResponse([refund, spend]));

    const result = await tool.execute({ budget_id: 'b1', month: '2024-01-01', skip_closed_cc_categories: false });

    expect(client.updateCategoryBudget).toHaveBeenCalledTimes(1);
    expect(client.updateCategoryBudget).toHaveBeenCalledWith('b1', 'c-refund', '2024-01-01', -15000);
    expect(result.phase).toBe('sweep_positives');
    expect(result.categories_touched).toBe(1);
    expect(result.total_moved_milliunits).toBe(15000);
  });

  it('preserves savings categories (goal + prior-month carryover)', async () => {
    const savings = createMockCategory({
      id: 'c-save', name: 'Vacation', category_group_name: 'Savings',
      goal_type: 'TB',
      // prior_carryover = 500 - 100 - 50 = 350 (positive)
      budgeted: 100000, activity: 50000, balance: 500000,
    });
    client.getBudgetMonth.mockResolvedValue(monthResponse([savings]));

    const result = await tool.execute({ budget_id: 'b1', month: '2024-01-01', skip_closed_cc_categories: false });

    expect(client.updateCategoryBudget).not.toHaveBeenCalled();
    expect(result.skipped.some(s => s.category_id === 'c-save' && s.reason === 'goal_carryover')).toBe(true);
  });

  it('still sweeps a goal category with no prior carryover (pure in-month inflow)', async () => {
    const savingsFreshInflow = createMockCategory({
      id: 'c-save-fresh', name: 'Vacation', category_group_name: 'Savings',
      goal_type: 'TB',
      // prior_carryover = 20 - 0 - 20 = 0
      budgeted: 0, activity: 20000, balance: 20000,
    });
    client.getBudgetMonth.mockResolvedValue(monthResponse([savingsFreshInflow]));

    const result = await tool.execute({ budget_id: 'b1', month: '2024-01-01', skip_closed_cc_categories: false });

    expect(client.updateCategoryBudget).toHaveBeenCalledWith('b1', 'c-save-fresh', '2024-01-01', -20000);
    expect(result.categories_touched).toBe(1);
  });

  it('ignores zero or negative activity', async () => {
    const quiet = createMockCategory({ id: 'c-q', name: 'Q', category_group_name: 'G', budgeted: 0, activity: 0, balance: 0 });
    const spent = createMockCategory({ id: 'c-s', name: 'S', category_group_name: 'G', budgeted: 100000, activity: -50000, balance: 50000 });
    client.getBudgetMonth.mockResolvedValue(monthResponse([quiet, spent]));

    const result = await tool.execute({ budget_id: 'b1', month: '2024-01-01', skip_closed_cc_categories: false });
    expect(client.updateCategoryBudget).not.toHaveBeenCalled();
    expect(result.categories_touched).toBe(0);
  });

  it('dry_run plans without PATCHing', async () => {
    const refund = createMockCategory({
      id: 'c-refund', name: 'Amazon', category_group_name: 'Shopping',
      budgeted: 0, activity: 15000, balance: 15000,
    });
    client.getBudgetMonth.mockResolvedValue(monthResponse([refund]));

    const result = await tool.execute({ budget_id: 'b1', month: '2024-01-01', dry_run: true, skip_closed_cc_categories: false });

    expect(client.updateCategoryBudget).not.toHaveBeenCalled();
    expect(result.dry_run).toBe(true);
    expect(result.details[0]!.status).toBe('planned');
  });

  it('wraps errors exactly once (no "failed: failed:" double-wrap)', async () => {
    client.getBudgetMonth.mockRejectedValue(new Error('boom'));
    try {
      await tool.execute({ budget_id: 'b1', month: '2024-01-01', skip_closed_cc_categories: false });
      expect.fail('expected error');
    } catch (e) {
      const msg = (e as Error).message;
      const occurrences = (msg.match(/auto-sweep positives failed/g) ?? []).length;
      expect(occurrences).toBe(1);
    }
  });
});
