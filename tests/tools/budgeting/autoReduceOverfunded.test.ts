import { describe, it, expect, beforeEach } from 'vitest';
import { AutoReduceOverfundedTool } from '../../../src/tools/budgeting/autoReduceOverfunded.js';
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

describe('AutoReduceOverfundedTool', () => {
  let client: MockYNABClient;
  let tool: AutoReduceOverfundedTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new AutoReduceOverfundedTool(client as any);
  });

  it('reduces a plain over-funded category back to its activity floor (issue #22 repro)', async () => {
    // Budgeted $7,584, only $28 spent (activity = -28000), no carryover, no goal.
    // Expect new_budgeted = 28000 (i.e., -activity), freeing $7,556 to RTA.
    const other = createMockCategory({
      id: 'c-other', name: 'Other', category_group_name: 'Misc',
      goal_type: null,
      budgeted: 7584000, activity: -28000, balance: 7556000,
    });
    client.getBudgetMonth.mockResolvedValue(monthResponse([other]));

    const result = await tool.execute({ budget_id: 'b1', month: '2024-01-01', skip_closed_cc_categories: false });

    expect(client.updateCategoryBudget).toHaveBeenCalledTimes(1);
    expect(client.updateCategoryBudget).toHaveBeenCalledWith('b1', 'c-other', '2024-01-01', 28000);
    expect(result.phase).toBe('reduce_overfunded');
    expect(result.categories_touched).toBe(1);
    expect(result.total_moved_milliunits).toBe(7556000);
  });

  it('preserves prior-month carryover (only frees the excess above carryover)', async () => {
    // prior_carryover = balance - budgeted - activity = 3000 - 2000 - 0 = 1000
    // protectedFloor = 1000, excess = 3000 - 1000 = 2000
    // new_budgeted = 2000 - 2000 = 0
    const slush = createMockCategory({
      id: 'c-slush', name: 'Slush', category_group_name: 'Misc',
      goal_type: null,
      budgeted: 2000000, activity: 0, balance: 3000000,
    });
    client.getBudgetMonth.mockResolvedValue(monthResponse([slush]));

    await tool.execute({ budget_id: 'b1', month: '2024-01-01', skip_closed_cc_categories: false });

    expect(client.updateCategoryBudget).toHaveBeenCalledWith('b1', 'c-slush', '2024-01-01', 0);
  });

  it('skips every category with a goal (regardless of carryover)', async () => {
    const goalFresh = createMockCategory({
      id: 'c-goal-fresh', name: 'New Laptop', category_group_name: 'Savings',
      goal_type: 'NEED',
      // no carryover, just funded this month
      budgeted: 3000000, activity: 0, balance: 3000000,
    });
    const goalCarry = createMockCategory({
      id: 'c-goal-carry', name: 'Vacation', category_group_name: 'Savings',
      goal_type: 'TB',
      // prior_carryover = 1000
      budgeted: 50000, activity: 0, balance: 1050000,
    });
    client.getBudgetMonth.mockResolvedValue(monthResponse([goalFresh, goalCarry]));

    const result = await tool.execute({ budget_id: 'b1', month: '2024-01-01', skip_closed_cc_categories: false });

    expect(client.updateCategoryBudget).not.toHaveBeenCalled();
    expect(result.skipped.some(s => s.category_id === 'c-goal-fresh' && s.reason === 'goal')).toBe(true);
    expect(result.skipped.some(s => s.category_id === 'c-goal-carry' && s.reason === 'goal')).toBe(true);
  });

  it('skips categories with non-positive balance (handled by other phases)', async () => {
    const zero = createMockCategory({
      id: 'c-zero', name: 'Zero', category_group_name: 'G', goal_type: null,
      budgeted: 50000, activity: -50000, balance: 0,
    });
    const negative = createMockCategory({
      id: 'c-neg', name: 'Underfunded', category_group_name: 'G', goal_type: null,
      budgeted: 0, activity: -25000, balance: -25000,
    });
    client.getBudgetMonth.mockResolvedValue(monthResponse([zero, negative]));

    const result = await tool.execute({ budget_id: 'b1', month: '2024-01-01', skip_closed_cc_categories: false });

    expect(client.updateCategoryBudget).not.toHaveBeenCalled();
    expect(result.categories_touched).toBe(0);
  });

  it('never sets budgeted below zero on a pure-refund category (defers to sweep)', async () => {
    // Refund only: budgeted=0, activity=10000, balance=10000, carryover=0.
    // Without clamping, excess=10000 → new_budgeted=-10000 (a sweep, not a reduce).
    // Standalone, this should be skipped: refunds belong to sweep_positives.
    const refund = createMockCategory({
      id: 'c-refund', name: 'Amazon', category_group_name: 'Shopping', goal_type: null,
      budgeted: 0, activity: 10000, balance: 10000,
    });
    client.getBudgetMonth.mockResolvedValue(monthResponse([refund]));

    const result = await tool.execute({ budget_id: 'b1', month: '2024-01-01', skip_closed_cc_categories: false });

    expect(client.updateCategoryBudget).not.toHaveBeenCalled();
    expect(result.categories_touched).toBe(0);
  });

  it('partially reduces an over-funded category that also has a refund (clamps at 0)', async () => {
    // budgeted=5000, activity=10000 (refund), balance=15000, carryover=0
    // Naive: new_budgeted = 5000 - 15000 = -10000 (would over-claim)
    // Clamped: new_budgeted = 0, delta = -5000 — frees only the over-budgeted
    // portion; the 10k refund stays for sweep_positives to handle.
    const mixed = createMockCategory({
      id: 'c-mixed', name: 'Mixed', category_group_name: 'G', goal_type: null,
      budgeted: 5000, activity: 10000, balance: 15000,
    });
    client.getBudgetMonth.mockResolvedValue(monthResponse([mixed]));

    const result = await tool.execute({ budget_id: 'b1', month: '2024-01-01', skip_closed_cc_categories: false });

    expect(client.updateCategoryBudget).toHaveBeenCalledWith('b1', 'c-mixed', '2024-01-01', 0);
    expect(result.total_moved_milliunits).toBe(5000);
  });

  it('skips a category whose entire positive balance is prior carryover (no excess)', async () => {
    // budgeted=0, activity=0, balance=1000 → carryover=1000, excess=0 → no change
    const savedUp = createMockCategory({
      id: 'c-saved', name: 'Saved', category_group_name: 'Misc', goal_type: null,
      budgeted: 0, activity: 0, balance: 1000000,
    });
    client.getBudgetMonth.mockResolvedValue(monthResponse([savedUp]));

    const result = await tool.execute({ budget_id: 'b1', month: '2024-01-01', skip_closed_cc_categories: false });

    expect(client.updateCategoryBudget).not.toHaveBeenCalled();
    expect(result.categories_touched).toBe(0);
  });

  it('skips Ready-to-Assign, hidden, deleted, and closed-CC payment categories', async () => {
    const rta = createMockCategory({
      id: 'c-rta', name: 'Inflow: Ready to Assign',
      category_group_name: 'Internal Master Category',
      goal_type: null, budgeted: 100000, activity: 0, balance: 100000,
    });
    const hidden = createMockCategory({
      id: 'c-hidden', name: 'Hidden Stash', hidden: true,
      category_group_name: 'Misc', goal_type: null,
      budgeted: 200000, activity: 0, balance: 200000,
    });
    const deleted = createMockCategory({
      id: 'c-del', name: 'Gone', deleted: true,
      category_group_name: 'Misc', goal_type: null,
      budgeted: 300000, activity: 0, balance: 300000,
    });
    const closedCc = createMockCategory({
      id: 'c-cc', name: 'Closed Amex',
      category_group_name: 'Credit Card Payments', goal_type: null,
      budgeted: 400000, activity: 0, balance: 400000,
    });
    client.getBudgetMonth.mockResolvedValue(monthResponse([rta, hidden, deleted, closedCc]));
    client.getAccounts.mockResolvedValue({
      accounts: [{ name: 'Closed Amex', type: 'creditCard', closed: true }],
      server_knowledge: 1,
    });

    const result = await tool.execute({ budget_id: 'b1', month: '2024-01-01' });

    expect(client.updateCategoryBudget).not.toHaveBeenCalled();
    expect(result.categories_touched).toBe(0);
  });

  it('honors include_categories', async () => {
    const a = createMockCategory({
      id: 'c-a', name: 'Alpha', category_group_name: 'G', goal_type: null,
      budgeted: 100000, activity: 0, balance: 100000,
    });
    const b = createMockCategory({
      id: 'c-b', name: 'Beta', category_group_name: 'G', goal_type: null,
      budgeted: 200000, activity: 0, balance: 200000,
    });
    client.getBudgetMonth.mockResolvedValue(monthResponse([a, b]));

    await tool.execute({
      budget_id: 'b1', month: '2024-01-01', skip_closed_cc_categories: false,
      include_categories: ['Alpha'],
    });

    expect(client.updateCategoryBudget).toHaveBeenCalledTimes(1);
    expect(client.updateCategoryBudget).toHaveBeenCalledWith('b1', 'c-a', '2024-01-01', 0);
  });

  it('honors exclude_categories', async () => {
    const a = createMockCategory({
      id: 'c-a', name: 'Alpha', category_group_name: 'G', goal_type: null,
      budgeted: 100000, activity: 0, balance: 100000,
    });
    const b = createMockCategory({
      id: 'c-b', name: 'Beta', category_group_name: 'G', goal_type: null,
      budgeted: 200000, activity: 0, balance: 200000,
    });
    client.getBudgetMonth.mockResolvedValue(monthResponse([a, b]));

    await tool.execute({
      budget_id: 'b1', month: '2024-01-01', skip_closed_cc_categories: false,
      exclude_categories: ['Alpha'],
    });

    expect(client.updateCategoryBudget).toHaveBeenCalledTimes(1);
    expect(client.updateCategoryBudget).toHaveBeenCalledWith('b1', 'c-b', '2024-01-01', 0);
  });

  it('dry_run plans without PATCHing', async () => {
    const other = createMockCategory({
      id: 'c-other', name: 'Other', category_group_name: 'Misc', goal_type: null,
      budgeted: 7584000, activity: -28000, balance: 7556000,
    });
    client.getBudgetMonth.mockResolvedValue(monthResponse([other]));

    const result = await tool.execute({
      budget_id: 'b1', month: '2024-01-01', dry_run: true, skip_closed_cc_categories: false,
    });

    expect(client.updateCategoryBudget).not.toHaveBeenCalled();
    expect(result.dry_run).toBe(true);
    expect(result.details[0]!.status).toBe('planned');
    expect(result.details[0]!.new_budgeted).toBe(28000);
    expect(result.details[0]!.delta).toBe(-7556000);
  });

  it('wraps errors exactly once (no double-wrap)', async () => {
    client.getBudgetMonth.mockRejectedValue(new Error('boom'));
    try {
      await tool.execute({ budget_id: 'b1', month: '2024-01-01', skip_closed_cc_categories: false });
      expect.fail('expected error');
    } catch (e) {
      const msg = (e as Error).message;
      const occurrences = (msg.match(/auto-reduce overfunded failed/g) ?? []).length;
      expect(occurrences).toBe(1);
    }
  });
});
