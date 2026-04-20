import { describe, it, expect, beforeEach } from 'vitest';
import { AssignSameAsLastMonthTool } from '../../../src/tools/budgeting/assignSameAsLastMonth.js';
import { previousMonth } from '../../../src/tools/budgeting/monthMath.js';
import { createMockClient, type MockYNABClient } from '../../helpers/mockClient.js';
import { createMockCategory } from '../../helpers/fixtures.js';

function monthResponse(categories: any[], to_be_budgeted = 0) {
  return {
    month: {
      month: '2024-02-01', note: null, income: 0, budgeted: 0, activity: 0,
      to_be_budgeted, age_of_money: null, deleted: false, categories,
    },
    server_knowledge: 1,
  };
}

describe('previousMonth', () => {
  it('handles January → previous December', () => {
    expect(previousMonth('2024-01-01')).toBe('2023-12-01');
  });
  it('handles mid-year months', () => {
    expect(previousMonth('2024-07-01')).toBe('2024-06-01');
  });
});

describe('AssignSameAsLastMonthTool', () => {
  let client: MockYNABClient;
  let tool: AssignSameAsLastMonthTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new AssignSameAsLastMonthTool(client as any);
  });

  it('copies previous month budgeted per category matched by id', async () => {
    const prev = [
      createMockCategory({ id: 'c-food', name: 'Food', category_group_name: 'Spending', budgeted: 60000 }),
      createMockCategory({ id: 'c-gas', name: 'Gas', category_group_name: 'Spending', budgeted: 40000 }),
    ];
    const cur = [
      createMockCategory({ id: 'c-food', name: 'Food', category_group_name: 'Spending', budgeted: 0 }),
      createMockCategory({ id: 'c-gas', name: 'Gas', category_group_name: 'Spending', budgeted: 10000 }),
    ];
    client.getBudgetMonth.mockImplementation(async (_b, m) => monthResponse(m === '2024-02-01' ? cur : prev));

    await tool.execute({ budget_id: 'b1', month: '2024-02-01', skip_closed_cc_categories: false });

    expect(client.updateCategoryBudget).toHaveBeenCalledWith('b1', 'c-food', '2024-02-01', 60000);
    expect(client.updateCategoryBudget).toHaveBeenCalledWith('b1', 'c-gas', '2024-02-01', 40000);
  });

  it('skips categories absent from previous month (new categories)', async () => {
    const prev = [createMockCategory({ id: 'c-food', name: 'Food', category_group_name: 'Spending', budgeted: 60000 })];
    const cur = [
      createMockCategory({ id: 'c-food', name: 'Food', category_group_name: 'Spending', budgeted: 0 }),
      createMockCategory({ id: 'c-new', name: 'New', category_group_name: 'Spending', budgeted: 0 }),
    ];
    client.getBudgetMonth.mockImplementation(async (_b, m) => monthResponse(m === '2024-02-01' ? cur : prev));

    const r = await tool.execute({ budget_id: 'b1', month: '2024-02-01', skip_closed_cc_categories: false });

    expect(client.updateCategoryBudget).toHaveBeenCalledTimes(1);
    expect(client.updateCategoryBudget).toHaveBeenCalledWith('b1', 'c-food', '2024-02-01', 60000);
    expect(r.skipped.some(s => s.category_id === 'c-new' && s.reason === 'no_prior_month')).toBe(true);
  });

  it('no-ops categories already matching previous month', async () => {
    const prev = [createMockCategory({ id: 'c-food', name: 'Food', category_group_name: 'Spending', budgeted: 60000 })];
    const cur = [createMockCategory({ id: 'c-food', name: 'Food', category_group_name: 'Spending', budgeted: 60000 })];
    client.getBudgetMonth.mockImplementation(async (_b, m) => monthResponse(m === '2024-02-01' ? cur : prev));

    const r = await tool.execute({ budget_id: 'b1', month: '2024-02-01', skip_closed_cc_categories: false });
    expect(client.updateCategoryBudget).not.toHaveBeenCalled();
    expect(r.categories_touched).toBe(0);
  });

  it('reports phase name', async () => {
    client.getBudgetMonth.mockResolvedValue(monthResponse([]));
    const r = await tool.execute({ budget_id: 'b1', month: '2024-02-01', skip_closed_cc_categories: false });
    expect(r.phase).toBe('assign_same_as_last_month');
  });
});
