import { describe, it, expect, beforeEach } from 'vitest';
import { AutoAssignUnderfundedTool } from '../../../src/tools/budgeting/autoAssignUnderfunded.js';
import { createMockClient, type MockYNABClient } from '../../helpers/mockClient.js';
import { createMockCategory, createMockAccount } from '../../helpers/fixtures.js';

function monthResponse(categories: any[], to_be_budgeted = 0) {
  return {
    month: {
      month: '2024-01-01',
      note: null,
      income: 0,
      budgeted: 0,
      activity: 0,
      to_be_budgeted,
      age_of_money: null,
      deleted: false,
      categories,
    },
    server_knowledge: 1,
  };
}

describe('AutoAssignUnderfundedTool', () => {
  let client: MockYNABClient;
  let tool: AutoAssignUnderfundedTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new AutoAssignUnderfundedTool(client as any);
  });

  it('patches each underfunded category up to balance=0', async () => {
    const underfunded = createMockCategory({
      id: 'c-under', name: 'Groceries', category_group_name: 'Spending',
      budgeted: 50000, activity: -120000, balance: -70000,
    });
    const ok = createMockCategory({
      id: 'c-ok', name: 'Rent', category_group_name: 'Bills',
      budgeted: 200000, activity: -200000, balance: 0,
    });
    client.getBudgetMonth.mockResolvedValue(monthResponse([underfunded, ok], 500000));

    const result = await tool.execute({
      budget_id: 'b1',
      month: '2024-01-01',
      skip_closed_cc_categories: false,
    });

    expect(client.updateCategoryBudget).toHaveBeenCalledTimes(1);
    expect(client.updateCategoryBudget).toHaveBeenCalledWith(
      'b1', 'c-under', '2024-01-01', 50000 + 70000 // previous + |balance|
    );
    expect(result.categories_touched).toBe(1);
    expect(result.total_moved_milliunits).toBe(70000);
    expect(result.phase).toBe('assign_underfunded');
  });

  it('is idempotent when every category is already funded', async () => {
    const ok = createMockCategory({
      id: 'c-ok', name: 'Rent', category_group_name: 'Bills',
      budgeted: 200000, activity: -200000, balance: 0,
    });
    client.getBudgetMonth.mockResolvedValue(monthResponse([ok]));

    const result = await tool.execute({
      budget_id: 'b1',
      month: '2024-01-01',
      skip_closed_cc_categories: false,
    });

    expect(client.updateCategoryBudget).not.toHaveBeenCalled();
    expect(result.categories_touched).toBe(0);
  });

  it('dry_run plans without PATCHing and skips the post-refresh GET', async () => {
    const underfunded = createMockCategory({
      id: 'c-under', name: 'Groceries', category_group_name: 'Spending',
      budgeted: 0, activity: -50000, balance: -50000,
    });
    client.getBudgetMonth.mockResolvedValue(monthResponse([underfunded]));

    const result = await tool.execute({
      budget_id: 'b1',
      month: '2024-01-01',
      dry_run: true,
      skip_closed_cc_categories: false,
    });

    expect(client.updateCategoryBudget).not.toHaveBeenCalled();
    expect(result.dry_run).toBe(true);
    expect(result.to_be_budgeted_after).toBeNull();
    expect(client.getBudgetMonth).toHaveBeenCalledTimes(1); // no refresh
    expect(result.details[0]!.status).toBe('planned');
  });

  it('skips closed-CC payment categories by default', async () => {
    client.getAccounts.mockResolvedValue({
      accounts: [createMockAccount({ name: 'Closed Amex', type: 'creditCard', closed: true })],
      server_knowledge: 1,
    });
    const ccUnder = createMockCategory({
      id: 'c-cc-closed', name: 'Closed Amex', category_group_name: 'Credit Card Payments',
      budgeted: 0, activity: 0, balance: -10000,
    });
    const regUnder = createMockCategory({
      id: 'c-food', name: 'Food', category_group_name: 'Spending',
      budgeted: 0, activity: -30000, balance: -30000,
    });
    client.getBudgetMonth.mockResolvedValue(monthResponse([ccUnder, regUnder]));

    const result = await tool.execute({ budget_id: 'b1', month: '2024-01-01' });

    expect(client.updateCategoryBudget).toHaveBeenCalledTimes(1);
    expect(client.updateCategoryBudget).toHaveBeenCalledWith('b1', 'c-food', '2024-01-01', 30000);
    expect(result.skipped_by_reason.closed_cc).toBe(1);
  });

  it('include list narrows work; exclude list removes funded candidates', async () => {
    const c1 = createMockCategory({ id: 'c-1', name: 'One', category_group_name: 'G', budgeted: 0, activity: -10000, balance: -10000 });
    const c2 = createMockCategory({ id: 'c-2', name: 'Two', category_group_name: 'G', budgeted: 0, activity: -20000, balance: -20000 });
    const c3 = createMockCategory({ id: 'c-3', name: 'Three', category_group_name: 'G', budgeted: 0, activity: -30000, balance: -30000 });
    client.getBudgetMonth.mockResolvedValue(monthResponse([c1, c2, c3]));

    await tool.execute({
      budget_id: 'b1',
      month: '2024-01-01',
      include_categories: ['c-1', 'Two'],
      exclude_categories: ['c-1'],
      skip_closed_cc_categories: false,
    });

    expect(client.updateCategoryBudget).toHaveBeenCalledTimes(1);
    expect(client.updateCategoryBudget).toHaveBeenCalledWith('b1', 'c-2', '2024-01-01', 20000);
  });

  it('wraps errors exactly once (no "failed: failed:" double-wrap)', async () => {
    client.getBudgetMonth.mockRejectedValue(new Error('boom'));
    try {
      await tool.execute({ budget_id: 'b1', month: '2024-01-01', skip_closed_cc_categories: false });
      expect.fail('expected error');
    } catch (e) {
      const msg = (e as Error).message;
      const occurrences = (msg.match(/auto-assign underfunded failed/g) ?? []).length;
      expect(occurrences).toBe(1);
    }
  });

  it('surfaces per-category failures without aborting the batch', async () => {
    const c1 = createMockCategory({ id: 'c-1', name: 'One', category_group_name: 'G', budgeted: 0, activity: -10000, balance: -10000 });
    const c2 = createMockCategory({ id: 'c-2', name: 'Two', category_group_name: 'G', budgeted: 0, activity: -20000, balance: -20000 });
    client.getBudgetMonth.mockResolvedValue(monthResponse([c1, c2]));
    client.updateCategoryBudget.mockImplementation(async (_b, id) => {
      if (id === 'c-1') throw new Error('rate_limit');
      return { category: { id } };
    });

    const result = await tool.execute({ budget_id: 'b1', month: '2024-01-01', skip_closed_cc_categories: false });

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.category_id).toBe('c-1');
    expect(result.categories_touched).toBe(1);
  });
});
