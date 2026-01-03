/**
 * GetBudgetMonthTool Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GetBudgetMonthTool } from '../../../src/tools/months/getBudgetMonth.js';
import { createMockClient, type MockYNABClient } from '../../helpers/mockClient.js';
import { createMockCategory, createMockCategoryGroup } from '../../helpers/fixtures.js';

function createMockBudgetMonth(overrides: {
  month?: string;
  note?: string | null;
  income?: number;
  budgeted?: number;
  activity?: number;
  to_be_budgeted?: number;
  age_of_money?: number | null;
  deleted?: boolean;
  categories?: any[];
} = {}) {
  return {
    month: overrides.month ?? '2024-01-01',
    note: 'note' in overrides ? overrides.note : null,
    income: overrides.income ?? 500000,
    budgeted: overrides.budgeted ?? 400000,
    activity: overrides.activity ?? -350000,
    to_be_budgeted: overrides.to_be_budgeted ?? 100000,
    age_of_money: 'age_of_money' in overrides ? overrides.age_of_money : 45,
    deleted: overrides.deleted ?? false,
    categories: overrides.categories ?? [
      createMockCategory({ id: 'cat-1', name: 'Groceries', budgeted: 100000, activity: -80000, balance: 20000 }),
    ],
  };
}

describe('GetBudgetMonthTool', () => {
  let client: MockYNABClient;
  let tool: GetBudgetMonthTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new GetBudgetMonthTool(client as any);
  });

  it('has correct name', () => {
    expect(tool.name).toBe('ynab_get_budget_month');
  });

  it('requires budget_id and month', async () => {
    await expect(tool.execute({})).rejects.toThrow();
    await expect(tool.execute({ budget_id: 'b' })).rejects.toThrow();
  });

  it('validates month format', async () => {
    // Invalid format - not YYYY-MM-01
    await expect(tool.execute({
      budget_id: 'test-budget',
      month: '2024-01-15',
    })).rejects.toThrow();

    await expect(tool.execute({
      budget_id: 'test-budget',
      month: '2024-1-01',
    })).rejects.toThrow();
  });

  it('returns budget month data with formatted amounts', async () => {
    const mockMonth = createMockBudgetMonth();
    client.getBudgetMonth.mockResolvedValue({
      month: mockMonth,
      server_knowledge: 100,
    });

    const mockCategoryGroup = createMockCategoryGroup(1, { name: 'Bills' });
    mockCategoryGroup.categories = mockMonth.categories;
    client.getCategories.mockResolvedValue({
      category_groups: [mockCategoryGroup],
      server_knowledge: 100,
    });

    const result = await tool.execute({
      budget_id: 'test-budget',
      month: '2024-01-01',
    });

    expect(result.month.month).toBe('2024-01-01');
    expect(result.month.income.milliunits).toBe(500000);
    expect(result.month.income.formatted).toBe('$500.00');
    expect(result.month.to_be_budgeted.milliunits).toBe(100000);
    expect(result.month.age_of_money).toBe(45);
    expect(result.server_knowledge).toBe(100);
  });

  it('includes formatted category data', async () => {
    const mockMonth = createMockBudgetMonth({
      categories: [
        createMockCategory({
          id: 'cat-1',
          name: 'Groceries',
          category_group_id: 'group-1',
          budgeted: 100000,
          activity: -80000,
          balance: 20000,
        }),
      ],
    });

    client.getBudgetMonth.mockResolvedValue({
      month: mockMonth,
      server_knowledge: 100,
    });

    const mockCategoryGroup = createMockCategoryGroup(1, { id: 'group-1', name: 'Food' });
    mockCategoryGroup.categories = mockMonth.categories;
    client.getCategories.mockResolvedValue({
      category_groups: [mockCategoryGroup],
      server_knowledge: 100,
    });

    const result = await tool.execute({
      budget_id: 'test-budget',
      month: '2024-01-01',
    });

    expect(result.month.categories).toHaveLength(1);
    const cat = result.month.categories[0];
    expect(cat.name).toBe('Groceries');
    expect(cat.budgeted.milliunits).toBe(100000);
    expect(cat.budgeted.formatted).toBe('$100.00');
    expect(cat.activity.milliunits).toBe(-80000);
    expect(cat.activity.formatted).toBe('$-80.00');
    expect(cat.balance.milliunits).toBe(20000);
    expect(cat.balance.formatted).toBe('$20.00');
  });

  it('includes category group name', async () => {
    const cat1 = createMockCategory({ id: 'cat-1', category_group_id: 'group-1' });
    const mockMonth = createMockBudgetMonth({ categories: [cat1] });

    client.getBudgetMonth.mockResolvedValue({
      month: mockMonth,
      server_knowledge: 100,
    });

    const mockCategoryGroup = createMockCategoryGroup(0, { id: 'group-1', name: 'Bills' });
    mockCategoryGroup.categories = [cat1];
    client.getCategories.mockResolvedValue({
      category_groups: [mockCategoryGroup],
      server_knowledge: 100,
    });

    const result = await tool.execute({
      budget_id: 'test-budget',
      month: '2024-01-01',
    });

    expect(result.month.categories[0].category_group_name).toBe('Bills');
  });

  it('handles month with no categories', async () => {
    const mockMonth = createMockBudgetMonth({ categories: [] });

    client.getBudgetMonth.mockResolvedValue({
      month: mockMonth,
      server_knowledge: 100,
    });

    client.getCategories.mockResolvedValue({
      category_groups: [],
      server_knowledge: 100,
    });

    const result = await tool.execute({
      budget_id: 'test-budget',
      month: '2024-01-01',
    });

    expect(result.month.categories).toHaveLength(0);
  });

  it('handles month note', async () => {
    const mockMonth = createMockBudgetMonth({ note: 'January budget notes' });

    client.getBudgetMonth.mockResolvedValue({
      month: mockMonth,
      server_knowledge: 100,
    });

    client.getCategories.mockResolvedValue({
      category_groups: [],
      server_knowledge: 100,
    });

    const result = await tool.execute({
      budget_id: 'test-budget',
      month: '2024-01-01',
    });

    expect(result.month.note).toBe('January budget notes');
  });

  it('handles API errors gracefully', async () => {
    client.getBudgetMonth.mockRejectedValue(new Error('API error'));

    await expect(tool.execute({
      budget_id: 'test-budget',
      month: '2024-01-01',
    })).rejects.toThrow('get budget month failed');
  });

  it('handles null age_of_money', async () => {
    const mockMonth = createMockBudgetMonth({ age_of_money: null });

    client.getBudgetMonth.mockResolvedValue({
      month: mockMonth,
      server_knowledge: 100,
    });

    client.getCategories.mockResolvedValue({
      category_groups: [],
      server_knowledge: 100,
    });

    const result = await tool.execute({
      budget_id: 'test-budget',
      month: '2024-01-01',
    });

    expect(result.month.age_of_money).toBeNull();
  });
});
