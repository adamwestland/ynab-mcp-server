import { describe, it, expect, beforeEach } from 'vitest';
import { AutoBalanceMonthTool } from '../../../src/tools/budgeting/autoBalanceMonth.js';
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

describe('AutoBalanceMonthTool', () => {
  let client: MockYNABClient;
  let tool: AutoBalanceMonthTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new AutoBalanceMonthTool(client as any);
  });

  it('runs sweep first then assign, reporting both phases', async () => {
    const refund = createMockCategory({
      id: 'c-refund', name: 'Amazon', category_group_name: 'Shopping',
      budgeted: 0, activity: 10000, balance: 10000,
    });
    const underfunded = createMockCategory({
      id: 'c-under', name: 'Groceries', category_group_name: 'Spending',
      budgeted: 0, activity: -40000, balance: -40000,
    });
    client.getBudgetMonth.mockResolvedValue(monthResponse([refund, underfunded], 100000));

    const result = await tool.execute({ budget_id: 'b1', month: '2024-01-01', skip_closed_cc_categories: false });

    expect(result.phases.map(p => p.phase)).toEqual(['sweep_positives', 'assign_underfunded']);
    const sweep = result.phases[0]!;
    const assign = result.phases[1]!;
    expect(sweep.categories_touched).toBe(1);
    expect(assign.categories_touched).toBe(1);
    expect(result.total_moved_milliunits).toBe(50000); // 10k sweep + 40k assign
  });

  it('loads accounts once across both phases (rate-limit conservation)', async () => {
    const refund = createMockCategory({
      id: 'c-refund', name: 'Amazon', category_group_name: 'Shopping',
      budgeted: 0, activity: 10000, balance: 10000,
    });
    const underfunded = createMockCategory({
      id: 'c-under', name: 'Groceries', category_group_name: 'Spending',
      budgeted: 0, activity: -40000, balance: -40000,
    });
    client.getBudgetMonth.mockResolvedValue(monthResponse([refund, underfunded]));

    await tool.execute({ budget_id: 'b1', month: '2024-01-01' });

    expect(client.getAccounts).toHaveBeenCalledTimes(1);
  });

  it('dry_run bubbles through to both phases', async () => {
    const refund = createMockCategory({
      id: 'c-refund', name: 'Amazon', category_group_name: 'Shopping',
      budgeted: 0, activity: 10000, balance: 10000,
    });
    client.getBudgetMonth.mockResolvedValue(monthResponse([refund]));

    const result = await tool.execute({ budget_id: 'b1', month: '2024-01-01', dry_run: true, skip_closed_cc_categories: false });

    expect(client.updateCategoryBudget).not.toHaveBeenCalled();
    expect(result.phases.every(p => p.dry_run)).toBe(true);
  });
});
