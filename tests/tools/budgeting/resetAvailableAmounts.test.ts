import { describe, it, expect, beforeEach } from 'vitest';
import { ResetAvailableAmountsTool } from '../../../src/tools/budgeting/resetAvailableAmounts.js';
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

describe('ResetAvailableAmountsTool', () => {
  let client: MockYNABClient;
  let tool: ResetAvailableAmountsTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new ResetAvailableAmountsTool(client as any);
  });

  it('zeroes positive balance by reducing budgeted', async () => {
    // balance=50, budgeted=50, activity=0 -> new_budgeted = 50 - 50 = 0
    const c = createMockCategory({ id: 'c-1', name: 'A', category_group_name: 'G', budgeted: 50000, activity: 0, balance: 50000 });
    client.getBudgetMonth.mockResolvedValue(monthResponse([c]));

    await tool.execute({ budget_id: 'b1', month: '2024-01-01', skip_closed_cc_categories: false });

    expect(client.updateCategoryBudget).toHaveBeenCalledWith('b1', 'c-1', '2024-01-01', 0);
  });

  it('zeroes negative balance by raising budgeted', async () => {
    // balance=-20, budgeted=0, activity=-20 -> new_budgeted = 0 - (-20) = 20
    const c = createMockCategory({ id: 'c-2', name: 'B', category_group_name: 'G', budgeted: 0, activity: -20000, balance: -20000 });
    client.getBudgetMonth.mockResolvedValue(monthResponse([c]));

    await tool.execute({ budget_id: 'b1', month: '2024-01-01', skip_closed_cc_categories: false });

    expect(client.updateCategoryBudget).toHaveBeenCalledWith('b1', 'c-2', '2024-01-01', 20000);
  });

  it('skips categories already at balance=0', async () => {
    const c = createMockCategory({ id: 'c-3', name: 'C', category_group_name: 'G', budgeted: 100000, activity: -100000, balance: 0 });
    client.getBudgetMonth.mockResolvedValue(monthResponse([c]));

    const r = await tool.execute({ budget_id: 'b1', month: '2024-01-01', skip_closed_cc_categories: false });
    expect(client.updateCategoryBudget).not.toHaveBeenCalled();
    expect(r.categories_touched).toBe(0);
  });

  it('reports phase name', async () => {
    client.getBudgetMonth.mockResolvedValue(monthResponse([]));
    const r = await tool.execute({ budget_id: 'b1', month: '2024-01-01', skip_closed_cc_categories: false });
    expect(r.phase).toBe('reset_available_amounts');
  });
});
