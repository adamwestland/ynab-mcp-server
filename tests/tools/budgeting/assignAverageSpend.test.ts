import { describe, it, expect, beforeEach } from 'vitest';
import { AssignAverageSpendTool } from '../../../src/tools/budgeting/assignAverageSpend.js';
import { createMockClient, type MockYNABClient } from '../../helpers/mockClient.js';
import { createMockCategory } from '../../helpers/fixtures.js';

function monthResponse(month: string, categories: any[], to_be_budgeted = 0) {
  return {
    month: { month, note: null, income: 0, budgeted: 0, activity: 0, to_be_budgeted, age_of_money: null, deleted: false, categories },
    server_knowledge: 1,
  };
}

describe('AssignAverageSpendTool', () => {
  let client: MockYNABClient;
  let tool: AssignAverageSpendTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new AssignAverageSpendTool(client as any);
  });

  it('sets budgeted to mean of absolute activity across lookback months', async () => {
    // 3 months of Food spending: -60, -90, -120 -> avg = 90
    const catId = 'c-food';
    const foodIn = (activity: number) => createMockCategory({
      id: catId, name: 'Food', category_group_name: 'Spending', budgeted: 0, activity, balance: 0,
    });
    client.getBudgetMonth.mockImplementation(async (_b, m) => {
      if (m === '2024-04-01') return monthResponse(m, [foodIn(0)]);
      if (m === '2024-03-01') return monthResponse(m, [foodIn(-120000)]);
      if (m === '2024-02-01') return monthResponse(m, [foodIn(-90000)]);
      if (m === '2024-01-01') return monthResponse(m, [foodIn(-60000)]);
      return monthResponse(m, []);
    });

    const r = await tool.execute({
      budget_id: 'b1',
      month: '2024-04-01',
      lookback_months: 3,
      skip_closed_cc_categories: false,
    });

    expect(client.updateCategoryBudget).toHaveBeenCalledWith('b1', catId, '2024-04-01', 90000);
    expect(r.lookback_used).toBe(3);
  });

  it('uses available history when fewer than requested lookback months exist', async () => {
    const catId = 'c-food';
    const foodIn = (activity: number) => createMockCategory({
      id: catId, name: 'Food', category_group_name: 'Spending', budgeted: 0, activity, balance: 0,
    });
    client.getBudgetMonth.mockImplementation(async (_b, m) => {
      if (m === '2024-04-01') return monthResponse(m, [foodIn(0)]);
      if (m === '2024-03-01') return monthResponse(m, [foodIn(-100000)]);
      if (m === '2024-02-01') return monthResponse(m, [foodIn(-200000)]);
      // no January
      if (m === '2024-01-01') return monthResponse(m, []);
      return monthResponse(m, []);
    });

    const r = await tool.execute({
      budget_id: 'b1',
      month: '2024-04-01',
      lookback_months: 3,
      skip_closed_cc_categories: false,
    });

    // Avg over the 2 months where data exists: (100 + 200) / 2 = 150
    expect(client.updateCategoryBudget).toHaveBeenCalledWith('b1', catId, '2024-04-01', 150000);
    expect(r.lookback_used).toBe(2);
  });

  it('ignores positive activity (refunds) so averages reflect net spending', async () => {
    const catId = 'c-food';
    const foodIn = (activity: number) => createMockCategory({
      id: catId, name: 'Food', category_group_name: 'Spending', budgeted: 0, activity, balance: 0,
    });
    client.getBudgetMonth.mockImplementation(async (_b, m) => {
      if (m === '2024-04-01') return monthResponse(m, [foodIn(0)]);
      if (m === '2024-03-01') return monthResponse(m, [foodIn(-100000)]);
      if (m === '2024-02-01') return monthResponse(m, [foodIn(20000)]); // refund month
      return monthResponse(m, []);
    });

    const r = await tool.execute({
      budget_id: 'b1',
      month: '2024-04-01',
      lookback_months: 2,
      skip_closed_cc_categories: false,
    });

    // Only the spend month counts: (100) / 1 = 100
    expect(client.updateCategoryBudget).toHaveBeenCalledWith('b1', catId, '2024-04-01', 100000);
    expect(r.lookback_used).toBe(1);
  });

  it('skips category with zero history', async () => {
    const catId = 'c-food';
    const foodIn = (activity: number) => createMockCategory({
      id: catId, name: 'Food', category_group_name: 'Spending', budgeted: 10000, activity, balance: 0,
    });
    client.getBudgetMonth.mockImplementation(async (_b, m) => {
      if (m === '2024-04-01') return monthResponse(m, [foodIn(0)]);
      return monthResponse(m, []);
    });

    await tool.execute({
      budget_id: 'b1',
      month: '2024-04-01',
      lookback_months: 3,
      skip_closed_cc_categories: false,
    });

    expect(client.updateCategoryBudget).not.toHaveBeenCalled();
  });
});
