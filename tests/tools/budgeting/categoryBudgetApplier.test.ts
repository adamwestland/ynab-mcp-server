import { describe, it, expect, beforeEach } from 'vitest';
import { applyBudgetChanges } from '../../../src/tools/budgeting/categoryBudgetApplier.js';
import { createMockClient, type MockYNABClient } from '../../helpers/mockClient.js';

describe('applyBudgetChanges', () => {
  let client: MockYNABClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it('returns no-op summary when given empty list', async () => {
    const res = await applyBudgetChanges(client as any, 'b1', '2024-01-01', []);
    expect(res.applied).toBe(0);
    expect(res.failed).toHaveLength(0);
    expect(client.updateCategoryBudget).not.toHaveBeenCalled();
  });

  it('applies changes sequentially in input order', async () => {
    const calls: string[] = [];
    client.updateCategoryBudget.mockImplementation(async (_b, categoryId, _m, budgeted) => {
      calls.push(categoryId as string);
      return { category: { id: categoryId, budgeted } };
    });

    await applyBudgetChanges(client as any, 'b1', '2024-01-01', [
      { category_id: 'c-1', category_name: 'A', previous_budgeted: 0, new_budgeted: 10000, delta: 10000 },
      { category_id: 'c-2', category_name: 'B', previous_budgeted: 0, new_budgeted: 20000, delta: 20000 },
      { category_id: 'c-3', category_name: 'C', previous_budgeted: 0, new_budgeted: 30000, delta: 30000 },
    ]);

    expect(calls).toEqual(['c-1', 'c-2', 'c-3']);
  });

  it('dry_run skips PATCHes and still returns planned changes', async () => {
    const res = await applyBudgetChanges(
      client as any,
      'b1',
      '2024-01-01',
      [{ category_id: 'c-1', category_name: 'A', previous_budgeted: 0, new_budgeted: 10000, delta: 10000 }],
      { dry_run: true }
    );

    expect(client.updateCategoryBudget).not.toHaveBeenCalled();
    expect(res.applied).toBe(1);
    expect(res.details[0]!.status).toBe('planned');
    expect(res.total_moved_milliunits).toBe(10000);
  });

  it('records failures per category but continues the batch', async () => {
    client.updateCategoryBudget.mockImplementation(async (_b, categoryId, _m, budgeted) => {
      if (categoryId === 'c-boom') throw new Error('YNAB 500');
      return { category: { id: categoryId, budgeted } };
    });

    const res = await applyBudgetChanges(client as any, 'b1', '2024-01-01', [
      { category_id: 'c-1', category_name: 'A', previous_budgeted: 0, new_budgeted: 10000, delta: 10000 },
      { category_id: 'c-boom', category_name: 'B', previous_budgeted: 0, new_budgeted: 20000, delta: 20000 },
      { category_id: 'c-3', category_name: 'C', previous_budgeted: 0, new_budgeted: 30000, delta: 30000 },
    ]);

    expect(res.applied).toBe(2);
    expect(res.failed).toHaveLength(1);
    expect(res.failed[0]!.category_id).toBe('c-boom');
    expect(res.failed[0]!.error).toContain('YNAB 500');
    expect(res.details.find(d => d.category_id === 'c-boom')!.status).toBe('failed');
  });

  it('skips no-op changes (delta === 0) without hitting the API', async () => {
    const res = await applyBudgetChanges(client as any, 'b1', '2024-01-01', [
      { category_id: 'c-1', category_name: 'A', previous_budgeted: 5000, new_budgeted: 5000, delta: 0 },
    ]);
    expect(client.updateCategoryBudget).not.toHaveBeenCalled();
    expect(res.details[0]!.status).toBe('skipped_noop');
    expect(res.applied).toBe(0);
  });

  it('tallies total_moved_milliunits using absolute deltas', async () => {
    const res = await applyBudgetChanges(client as any, 'b1', '2024-01-01', [
      { category_id: 'c-1', category_name: 'A', previous_budgeted: 0, new_budgeted: 10000, delta: 10000 },
      { category_id: 'c-2', category_name: 'B', previous_budgeted: 5000, new_budgeted: 2000, delta: -3000 },
    ]);
    expect(res.total_moved_milliunits).toBe(13000);
  });
});
