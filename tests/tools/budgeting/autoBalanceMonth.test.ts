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

  it('runs sweep, reduce, then assign by default, reporting all three phases', async () => {
    // Phase 1 sees refund as a sweep target. After sweep, refund's balance
    // would be 0 in YNAB; the mock has to be told that so phase 2 doesn't
    // re-touch it. Same idea between phase 2 and phase 3.
    const refundBeforeSweep = createMockCategory({
      id: 'c-refund', name: 'Amazon', category_group_name: 'Shopping', goal_type: null,
      budgeted: 0, activity: 10000, balance: 10000,
    });
    const refundAfterSweep = createMockCategory({
      id: 'c-refund', name: 'Amazon', category_group_name: 'Shopping', goal_type: null,
      budgeted: -10000, activity: 10000, balance: 0,
    });
    const overfunded = createMockCategory({
      id: 'c-other', name: 'Other', category_group_name: 'Misc', goal_type: null,
      // budgeted 7584, activity -28 (small spend), balance 7556 — issue #22 repro
      budgeted: 7584000, activity: -28000, balance: 7556000,
    });
    const overfundedAfterReduce = createMockCategory({
      id: 'c-other', name: 'Other', category_group_name: 'Misc', goal_type: null,
      budgeted: 28000, activity: -28000, balance: 0,
    });
    const underfunded = createMockCategory({
      id: 'c-under', name: 'Groceries', category_group_name: 'Spending', goal_type: null,
      budgeted: 0, activity: -40000, balance: -40000,
    });

    client.getBudgetMonth
      // initial load + post-sweep refresh + post-reduce refresh + final refreshToBeBudgeted calls
      .mockResolvedValueOnce(monthResponse([refundBeforeSweep, overfunded, underfunded], 100000))
      .mockResolvedValueOnce(monthResponse([refundBeforeSweep, overfunded, underfunded], 100000)) // sweep refreshToBeBudgeted
      .mockResolvedValueOnce(monthResponse([refundAfterSweep, overfunded, underfunded], 110000)) // reduce phase load
      .mockResolvedValueOnce(monthResponse([refundAfterSweep, overfunded, underfunded], 110000)) // reduce refreshToBeBudgeted
      .mockResolvedValueOnce(monthResponse([refundAfterSweep, overfundedAfterReduce, underfunded], 7666000)) // assign phase load
      .mockResolvedValue(monthResponse([refundAfterSweep, overfundedAfterReduce, underfunded], 7626000)); // assign refreshToBeBudgeted (and any extras)

    const result = await tool.execute({ budget_id: 'b1', month: '2024-01-01', skip_closed_cc_categories: false });

    expect(result.phases.map(p => p.phase)).toEqual([
      'sweep_positives',
      'reduce_overfunded',
      'assign_underfunded',
    ]);
    const [sweep, reduce, assign] = result.phases;
    expect(sweep!.categories_touched).toBe(1);
    expect(reduce!.categories_touched).toBe(1);
    expect(assign!.categories_touched).toBe(1);
    // 10k swept + 7,556k reduced + 40k assigned
    expect(result.total_moved_milliunits).toBe(10000 + 7556000 + 40000);
  });

  it('loads accounts once across all phases (rate-limit conservation)', async () => {
    const refund = createMockCategory({
      id: 'c-refund', name: 'Amazon', category_group_name: 'Shopping', goal_type: null,
      budgeted: 0, activity: 10000, balance: 10000,
    });
    const underfunded = createMockCategory({
      id: 'c-under', name: 'Groceries', category_group_name: 'Spending', goal_type: null,
      budgeted: 0, activity: -40000, balance: -40000,
    });
    client.getBudgetMonth.mockResolvedValue(monthResponse([refund, underfunded]));

    await tool.execute({ budget_id: 'b1', month: '2024-01-01' });

    expect(client.getAccounts).toHaveBeenCalledTimes(1);
  });

  it('dry_run bubbles through to all phases', async () => {
    const refund = createMockCategory({
      id: 'c-refund', name: 'Amazon', category_group_name: 'Shopping', goal_type: null,
      budgeted: 0, activity: 10000, balance: 10000,
    });
    client.getBudgetMonth.mockResolvedValue(monthResponse([refund]));

    const result = await tool.execute({ budget_id: 'b1', month: '2024-01-01', dry_run: true, skip_closed_cc_categories: false });

    expect(client.updateCategoryBudget).not.toHaveBeenCalled();
    expect(result.phases.every(p => p.dry_run)).toBe(true);
    expect(result.phases.map(p => p.phase)).toEqual([
      'sweep_positives',
      'reduce_overfunded',
      'assign_underfunded',
    ]);
  });

  it('dry_run simulates each phase forward — refund category does not double-count', async () => {
    // Pure refund: budgeted=0, activity=10000, balance=10000.
    // Sweep would PATCH to budgeted=-10000 (delta=-10000).
    // After simulation, balance becomes 0 → reduce sees nothing to do.
    // Without forward-simulation, reduce would re-plan this same category
    // (clamped to 0 delta) and assign would see balance > 0 still.
    const refund = createMockCategory({
      id: 'c-refund', name: 'Amazon', category_group_name: 'Shopping', goal_type: null,
      budgeted: 0, activity: 10000, balance: 10000,
    });
    client.getBudgetMonth.mockResolvedValue(monthResponse([refund]));

    const result = await tool.execute({
      budget_id: 'b1', month: '2024-01-01', dry_run: true, skip_closed_cc_categories: false,
    });

    const [sweep, reduce, assign] = result.phases;
    expect(sweep!.categories_touched).toBe(1);
    expect(reduce!.categories_touched).toBe(0);
    expect(assign!.categories_touched).toBe(0);
    // Total moved should equal sweep alone, not sweep+reduce double-count.
    expect(result.total_moved_milliunits).toBe(10000);
  });

  it('reduce_overfunded:false skips the middle phase (back to original two-phase behavior)', async () => {
    const refund = createMockCategory({
      id: 'c-refund', name: 'Amazon', category_group_name: 'Shopping', goal_type: null,
      budgeted: 0, activity: 10000, balance: 10000,
    });
    const overfunded = createMockCategory({
      id: 'c-other', name: 'Other', category_group_name: 'Misc', goal_type: null,
      budgeted: 7584000, activity: -28000, balance: 7556000,
    });
    client.getBudgetMonth.mockResolvedValue(monthResponse([refund, overfunded]));

    const result = await tool.execute({
      budget_id: 'b1', month: '2024-01-01',
      skip_closed_cc_categories: false,
      reduce_overfunded: false,
    });

    expect(result.phases.map(p => p.phase)).toEqual(['sweep_positives', 'assign_underfunded']);
    // overfunded category is NOT touched when reduce_overfunded is off
    expect(client.updateCategoryBudget).not.toHaveBeenCalledWith('b1', 'c-other', expect.anything(), expect.anything());
  });
});
