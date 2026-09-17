/**
 * GetBudgetMonthTool Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
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

  describe('response trimming', () => {
    function setupWithCategories(cats: any[]) {
      const mockMonth = createMockBudgetMonth({ categories: cats });
      client.getBudgetMonth.mockResolvedValue({ month: mockMonth, server_knowledge: 1 });
      const group = createMockCategoryGroup(0, { id: 'g1', name: 'G' });
      group.categories = cats;
      client.getCategories.mockResolvedValue({ category_groups: [group], server_knowledge: 1 });
    }

    it('filters zero-only categories by default', async () => {
      setupWithCategories([
        createMockCategory({ id: 'active', name: 'Active', budgeted: 100000, activity: -50000, balance: 50000 }),
        createMockCategory({ id: 'zero', name: 'Zero', budgeted: 0, activity: 0, balance: 0 }),
      ]);

      const result = await tool.execute({ budget_id: 'b', month: '2024-01-01' });

      expect(result.month.categories).toHaveLength(1);
      expect(result.month.categories[0]!.id).toBe('active');
    });

    it('drops goal_* fields, original_category_group_id, and deleted from categories', async () => {
      setupWithCategories([
        createMockCategory({
          id: 'cat-1',
          name: 'G',
          budgeted: 100000,
          activity: -10000,
          balance: 90000,
          goal_type: 'TB',
          goal_target: 500000,
          goal_percentage_complete: 18,
          original_category_group_id: 'old-group',
        }),
      ]);

      const result = await tool.execute({ budget_id: 'b', month: '2024-01-01' });
      const cat = result.month.categories[0] as Record<string, unknown>;

      for (const key of Object.keys(cat)) {
        expect(key.startsWith('goal_')).toBe(false);
      }
      expect(cat.original_category_group_id).toBeUndefined();
      expect(cat.deleted).toBeUndefined();
    });

    it('omits note key when note is null or empty', async () => {
      setupWithCategories([
        createMockCategory({ id: 'c1', name: 'A', budgeted: 1000, activity: 0, balance: 1000, note: null }),
        createMockCategory({ id: 'c2', name: 'B', budgeted: 1000, activity: 0, balance: 1000, note: '' }),
      ]);

      const result = await tool.execute({ budget_id: 'b', month: '2024-01-01' });

      for (const cat of result.month.categories) {
        expect('note' in cat).toBe(false);
      }
    });

    it('keeps note when present', async () => {
      setupWithCategories([
        createMockCategory({ id: 'c1', name: 'A', budgeted: 1000, activity: 0, balance: 1000, note: 'keep me' }),
      ]);

      const result = await tool.execute({ budget_id: 'b', month: '2024-01-01' });

      expect(result.month.categories[0]!.note).toBe('keep me');
    });

    it('drops month-level deleted field', async () => {
      setupWithCategories([
        createMockCategory({ id: 'c', name: 'x', budgeted: 1000, activity: 0, balance: 1000 }),
      ]);

      const result = await tool.execute({ budget_id: 'b', month: '2024-01-01' });

      expect('deleted' in result.month).toBe(false);
    });
  });

  describe('category_filter', () => {
    const cats = () => [
      createMockCategory({ id: 'budgeted-only', name: 'Pre-funded', budgeted: 100000, activity: 0, balance: 100000 }),
      createMockCategory({ id: 'activity-only', name: 'Spent', budgeted: 0, activity: -50000, balance: -50000 }),
      createMockCategory({ id: 'balance-only', name: 'Carryover', budgeted: 0, activity: 0, balance: 25000 }),
      createMockCategory({ id: 'zero', name: 'Dormant', budgeted: 0, activity: 0, balance: 0 }),
    ];

    function setup() {
      const c = cats();
      const mockMonth = createMockBudgetMonth({ categories: c });
      client.getBudgetMonth.mockResolvedValue({ month: mockMonth, server_knowledge: 1 });
      const group = createMockCategoryGroup(0, { id: 'g1', name: 'G' });
      group.categories = c;
      client.getCategories.mockResolvedValue({ category_groups: [group], server_knowledge: 1 });
    }

    it('active (default) includes budgeted/activity/balance non-zero, excludes dormant', async () => {
      setup();
      const result = await tool.execute({ budget_id: 'b', month: '2024-01-01' });
      const ids = result.month.categories.map(c => c.id);
      expect(ids).toEqual(['budgeted-only', 'activity-only', 'balance-only']);
    });

    it('with_activity includes only activity != 0', async () => {
      setup();
      const result = await tool.execute({ budget_id: 'b', month: '2024-01-01', category_filter: 'with_activity' });
      const ids = result.month.categories.map(c => c.id);
      expect(ids).toEqual(['activity-only']);
    });

    it('with_balance includes only balance != 0', async () => {
      setup();
      const result = await tool.execute({ budget_id: 'b', month: '2024-01-01', category_filter: 'with_balance' });
      const ids = result.month.categories.map(c => c.id);
      expect(ids).toEqual(['budgeted-only', 'activity-only', 'balance-only']);
    });

    it('all includes every category including dormant', async () => {
      setup();
      const result = await tool.execute({ budget_id: 'b', month: '2024-01-01', category_filter: 'all' });
      const ids = result.month.categories.map(c => c.id);
      expect(ids).toEqual(['budgeted-only', 'activity-only', 'balance-only', 'zero']);
    });

    it('rejects invalid category_filter', async () => {
      setup();
      await expect(tool.execute({ budget_id: 'b', month: '2024-01-01', category_filter: 'bogus' })).rejects.toThrow();
    });

    it('excludes deleted categories from every filter mode (including "all")', async () => {
      const live = createMockCategory({ id: 'live', name: 'Live', budgeted: 100000, activity: 0, balance: 100000, deleted: false });
      const gone = createMockCategory({ id: 'gone', name: 'Deleted', budgeted: 50000, activity: -25000, balance: 25000, deleted: true });

      for (const filter of ['active', 'with_activity', 'with_balance', 'all'] as const) {
        const mockMonth = createMockBudgetMonth({ categories: [live, gone] });
        client.getBudgetMonth.mockResolvedValue({ month: mockMonth, server_knowledge: 1 });
        const group = createMockCategoryGroup(0, { id: 'g1', name: 'G' });
        group.categories = [live, gone];
        client.getCategories.mockResolvedValue({ category_groups: [group], server_knowledge: 1 });

        const result = await tool.execute({ budget_id: 'b', month: '2024-01-01', category_filter: filter });
        const ids = result.month.categories.map(c => c.id);
        expect(ids).not.toContain('gone');
      }
    });
  });

  describe('output_path', () => {
    let dir: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'ynab-mcp-budget-month-'));
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    function primeMonth() {
      const mockMonth = createMockBudgetMonth({
        categories: [
          createMockCategory({ id: 'cat-1', name: 'Groceries', category_group_id: 'group-1', budgeted: 100000, activity: -80000, balance: 20000 }),
          createMockCategory({ id: 'cat-2', name: 'Dormant', category_group_id: 'group-1', budgeted: 0, activity: 0, balance: 0 }),
        ],
      });
      client.getBudgetMonth.mockResolvedValue({ month: mockMonth, server_knowledge: 777 });
      const group = createMockCategoryGroup(1, { id: 'group-1', name: 'Food' });
      group.categories = mockMonth.categories;
      client.getCategories.mockResolvedValue({ category_groups: [group], server_knowledge: 777 });
    }

    it('writes the full result to the file and returns a summary instead', async () => {
      primeMonth();
      const target = join(dir, 'budget-month.json');

      const result = await tool.execute({
        budget_id: 'test-budget',
        month: '2024-01-01',
        category_filter: 'all',
        output_path: target,
      });

      // summary, not data
      expect(result).toMatchObject({
        path: target,
        month: '2024-01-01',
        category_filter: 'all',
        category_count: 2,
        server_knowledge: 777,
      });
      expect((result as any).to_be_budgeted.milliunits).toBe(100000);
      expect((result as any).month).toBe('2024-01-01');
      expect((result as any).categories).toBeUndefined();

      // the file has exactly the normal response shape
      const text = readFileSync(target, 'utf-8');
      expect((result as any).bytes).toBe(Buffer.byteLength(text, 'utf-8'));
      const saved = JSON.parse(text);
      expect(saved.server_knowledge).toBe(777);
      expect(saved.month.month).toBe('2024-01-01');
      expect(saved.month.categories.map((c: any) => c.name)).toEqual(['Groceries', 'Dormant']);
      expect(saved.month.categories[0].category_group_name).toBe('Food');
      expect(saved.month.categories[0].balance).toEqual({ milliunits: 20000, formatted: '$20.00' });
    });

    it('applies category_filter before writing', async () => {
      primeMonth();
      const target = join(dir, 'active.json');

      const result = await tool.execute({
        budget_id: 'test-budget',
        month: '2024-01-01',
        output_path: target,
      });

      expect((result as any).category_count).toBe(1);
      expect((result as any).category_filter).toBe('active');
      const saved = JSON.parse(readFileSync(target, 'utf-8'));
      expect(saved.month.categories.map((c: any) => c.name)).toEqual(['Groceries']);
    });

    it('creates missing parent directories', async () => {
      primeMonth();
      const target = join(dir, 'proposals', '2024-01-01.budget-month.json');

      await tool.execute({ budget_id: 'test-budget', month: '2024-01-01', output_path: target });

      expect(JSON.parse(readFileSync(target, 'utf-8')).month.month).toBe('2024-01-01');
    });

    it('rejects an output_path outside the allowed directories before calling the API', async () => {
      primeMonth();
      const saved = process.env.YNAB_OUTPUT_DIR;
      process.env.YNAB_OUTPUT_DIR = dir;
      try {
        await expect(tool.execute({
          budget_id: 'test-budget',
          month: '2024-01-01',
          output_path: join(dir, '..', 'escape.json'),
        })).rejects.toThrow(/outside the allowed output directories/);
        expect(client.getBudgetMonth).not.toHaveBeenCalled();
      } finally {
        if (saved === undefined) delete process.env.YNAB_OUTPUT_DIR;
        else process.env.YNAB_OUTPUT_DIR = saved;
      }
    });

    it('rejects an empty output_path', async () => {
      primeMonth();
      await expect(tool.execute({ budget_id: 'test-budget', month: '2024-01-01', output_path: '' })).rejects.toThrow();
    });

    it('returns inline data when output_path is omitted', async () => {
      primeMonth();
      const result = await tool.execute({ budget_id: 'test-budget', month: '2024-01-01' });
      expect((result as any).path).toBeUndefined();
      expect((result as any).month.categories).toHaveLength(1);
    });
  });
});
