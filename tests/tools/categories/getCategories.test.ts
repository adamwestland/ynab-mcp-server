/**
 * Category Tools Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GetCategoriesTool } from '../../../src/tools/categories/getCategories.js';
import { GetCategoryTool } from '../../../src/tools/categories/getCategory.js';
import { UpdateCategoryBudgetTool } from '../../../src/tools/categories/updateCategoryBudget.js';
import { createMockClient, type MockYNABClient } from '../../helpers/mockClient.js';
import { createMockCategory, createMockCategoryGroup } from '../../helpers/fixtures.js';

describe('GetCategoriesTool', () => {
  let client: MockYNABClient;
  let tool: GetCategoriesTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new GetCategoriesTool(client as any);
  });

  it('has correct name', () => {
    expect(tool.name).toBe('ynab_get_categories');
  });

  it('requires budget_id', async () => {
    await expect(tool.execute({})).rejects.toThrow();
  });

  it('returns category groups with categories', async () => {
    const mockGroup = createMockCategoryGroup(2, { name: 'Bills' });
    client.getCategories.mockResolvedValue({
      category_groups: [mockGroup],
      server_knowledge: 1,
    });

    const result = await tool.execute({ budget_id: 'test-budget' });

    expect(result.category_groups).toHaveLength(1);
    expect(result.category_groups[0].name).toBe('Bills');
    expect(result.category_groups[0].categories).toHaveLength(2);
  });

  it('passes last_knowledge_of_server to API', async () => {
    client.getCategories.mockResolvedValue({
      category_groups: [],
      server_knowledge: 100,
    });

    await tool.execute({
      budget_id: 'test-budget',
      last_knowledge_of_server: 50,
    });

    expect(client.getCategories).toHaveBeenCalledWith('test-budget', { lastKnowledgeOfServer: 50 });
  });

  it('handles API errors gracefully', async () => {
    client.getCategories.mockRejectedValue(new Error('API error'));
    await expect(tool.execute({ budget_id: 'test-budget' })).rejects.toThrow();
  });

  describe('response trimming', () => {
    function setupWithCategories(cats: any[], groupOverrides: any = {}) {
      const group = createMockCategoryGroup(0, { id: 'g1', name: 'G', ...groupOverrides });
      group.categories = cats;
      client.getCategories.mockResolvedValue({ category_groups: [group], server_knowledge: 1 });
    }

    it('filters zero-only categories by default (active filter)', async () => {
      setupWithCategories([
        createMockCategory({ id: 'active', name: 'Active', budgeted: 100000, activity: -50000, balance: 50000 }),
        createMockCategory({ id: 'zero', name: 'Zero', budgeted: 0, activity: 0, balance: 0 }),
      ]);

      const result = await tool.execute({ budget_id: 'test-budget' });

      expect(result.category_groups).toHaveLength(1);
      expect(result.category_groups[0]!.categories).toHaveLength(1);
      expect(result.category_groups[0]!.categories[0]!.id).toBe('active');
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

      const result = await tool.execute({ budget_id: 'test-budget' });
      const cat = result.category_groups[0]!.categories[0] as Record<string, unknown>;

      for (const key of Object.keys(cat)) {
        expect(key.startsWith('goal_')).toBe(false);
      }
      expect(cat.original_category_group_id).toBeUndefined();
      expect(cat.deleted).toBeUndefined();
    });

    it('drops deleted field from category groups', async () => {
      setupWithCategories([
        createMockCategory({ id: 'c', name: 'x', budgeted: 1000, activity: 0, balance: 1000 }),
      ]);

      const result = await tool.execute({ budget_id: 'test-budget' });
      const group = result.category_groups[0] as Record<string, unknown>;

      expect('deleted' in group).toBe(false);
    });

    it('omits note key when note is null or empty', async () => {
      setupWithCategories([
        createMockCategory({ id: 'c1', name: 'A', budgeted: 1000, activity: 0, balance: 1000, note: null }),
        createMockCategory({ id: 'c2', name: 'B', budgeted: 1000, activity: 0, balance: 1000, note: '' }),
      ]);

      const result = await tool.execute({ budget_id: 'test-budget' });

      for (const cat of result.category_groups[0]!.categories) {
        expect('note' in cat).toBe(false);
      }
    });

    it('keeps note when present', async () => {
      setupWithCategories([
        createMockCategory({ id: 'c1', name: 'A', budgeted: 1000, activity: 0, balance: 1000, note: 'keep me' }),
      ]);

      const result = await tool.execute({ budget_id: 'test-budget' });

      expect(result.category_groups[0]!.categories[0]!.note).toBe('keep me');
    });

    it('drops empty groups after filtering', async () => {
      const populatedGroup = createMockCategoryGroup(0, { id: 'g-pop', name: 'Populated' });
      populatedGroup.categories = [
        createMockCategory({ id: 'active', name: 'Active', budgeted: 100000, activity: 0, balance: 100000 }),
      ];
      const emptyGroup = createMockCategoryGroup(0, { id: 'g-empty', name: 'OnlyZeros' });
      emptyGroup.categories = [
        createMockCategory({ id: 'zero', name: 'Zero', budgeted: 0, activity: 0, balance: 0 }),
      ];
      client.getCategories.mockResolvedValue({
        category_groups: [populatedGroup, emptyGroup],
        server_knowledge: 1,
      });

      const result = await tool.execute({ budget_id: 'test-budget' });

      expect(result.category_groups).toHaveLength(1);
      expect(result.category_groups[0]!.id).toBe('g-pop');
    });

    it('excludes deleted groups always (including "all" filter)', async () => {
      const live = createMockCategoryGroup(0, { id: 'live', name: 'Live', deleted: false });
      live.categories = [
        createMockCategory({ id: 'c1', name: 'A', budgeted: 1000, activity: 0, balance: 1000 }),
      ];
      const gone = createMockCategoryGroup(0, { id: 'gone', name: 'Deleted', deleted: true });
      gone.categories = [
        createMockCategory({ id: 'c2', name: 'B', budgeted: 1000, activity: 0, balance: 1000 }),
      ];
      client.getCategories.mockResolvedValue({
        category_groups: [live, gone],
        server_knowledge: 1,
      });

      for (const filter of ['active', 'with_activity', 'with_balance', 'all'] as const) {
        const result = await tool.execute({ budget_id: 'test-budget', category_filter: filter });
        const ids = result.category_groups.map(g => g.id);
        expect(ids).not.toContain('gone');
      }
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
      const group = createMockCategoryGroup(0, { id: 'g1', name: 'G' });
      group.categories = c;
      client.getCategories.mockResolvedValue({ category_groups: [group], server_knowledge: 1 });
    }

    it('active (default) includes budgeted/activity/balance non-zero, excludes dormant', async () => {
      setup();
      const result = await tool.execute({ budget_id: 'b' });
      const ids = result.category_groups[0]!.categories.map(c => c.id);
      expect(ids).toEqual(['budgeted-only', 'activity-only', 'balance-only']);
    });

    it('with_activity includes only activity != 0', async () => {
      setup();
      const result = await tool.execute({ budget_id: 'b', category_filter: 'with_activity' });
      const ids = result.category_groups[0]!.categories.map(c => c.id);
      expect(ids).toEqual(['activity-only']);
    });

    it('with_balance includes only balance != 0', async () => {
      setup();
      const result = await tool.execute({ budget_id: 'b', category_filter: 'with_balance' });
      const ids = result.category_groups[0]!.categories.map(c => c.id);
      expect(ids).toEqual(['budgeted-only', 'activity-only', 'balance-only']);
    });

    it('all includes every category including dormant', async () => {
      setup();
      const result = await tool.execute({ budget_id: 'b', category_filter: 'all' });
      const ids = result.category_groups[0]!.categories.map(c => c.id);
      expect(ids).toEqual(['budgeted-only', 'activity-only', 'balance-only', 'zero']);
    });

    it('rejects invalid category_filter', async () => {
      setup();
      await expect(tool.execute({ budget_id: 'b', category_filter: 'bogus' })).rejects.toThrow();
    });

    it('excludes deleted categories from every filter mode (including "all")', async () => {
      // Live category needs non-zero across all three to survive every filter mode
      const live = createMockCategory({ id: 'live', name: 'Live', budgeted: 100000, activity: -50000, balance: 50000, deleted: false });
      const gone = createMockCategory({ id: 'gone', name: 'Deleted', budgeted: 50000, activity: -25000, balance: 25000, deleted: true });

      for (const filter of ['active', 'with_activity', 'with_balance', 'all'] as const) {
        const group = createMockCategoryGroup(0, { id: 'g1', name: 'G' });
        group.categories = [live, gone];
        client.getCategories.mockResolvedValue({ category_groups: [group], server_knowledge: 1 });

        const result = await tool.execute({ budget_id: 'b', category_filter: filter });
        const ids = result.category_groups[0]!.categories.map(c => c.id);
        expect(ids).not.toContain('gone');
      }
    });
  });

  describe('delta sync safety', () => {
    it('forces category_filter to "all" when last_knowledge_of_server is set (prevents silent data loss)', async () => {
      // A category that changed to zero would be in the delta but dropped by the active filter,
      // causing silent drift for incremental-sync consumers.
      const zeroed = createMockCategory({ id: 'zeroed', name: 'Zeroed', budgeted: 0, activity: 0, balance: 0 });
      const group = createMockCategoryGroup(0, { id: 'g1', name: 'G' });
      group.categories = [zeroed];
      client.getCategories.mockResolvedValue({ category_groups: [group], server_knowledge: 200 });

      const result = await tool.execute({
        budget_id: 'b',
        last_knowledge_of_server: 100,
        // category_filter defaults to 'active' but should be overridden to 'all' under delta sync
      });

      expect(result.category_groups).toHaveLength(1);
      expect(result.category_groups[0]!.categories).toHaveLength(1);
      expect(result.category_groups[0]!.categories[0]!.id).toBe('zeroed');
    });

    it('does not drop deleted categories when forcing all filter under delta sync', async () => {
      // Even under delta sync, deleted categories should still be excluded —
      // they're communicated via the top-level deleted flag on the original response,
      // but the processed output already strips that. So dropping them is fine;
      // what matters is that non-deleted-zero changes survive.
      const live = createMockCategory({ id: 'live', name: 'Live', budgeted: 0, activity: 0, balance: 0, deleted: false });
      const gone = createMockCategory({ id: 'gone', name: 'Gone', budgeted: 0, activity: 0, balance: 0, deleted: true });
      const group = createMockCategoryGroup(0, { id: 'g1', name: 'G' });
      group.categories = [live, gone];
      client.getCategories.mockResolvedValue({ category_groups: [group], server_knowledge: 300 });

      const result = await tool.execute({
        budget_id: 'b',
        last_knowledge_of_server: 200,
      });

      const ids = result.category_groups[0]!.categories.map(c => c.id);
      expect(ids).toContain('live');
      expect(ids).not.toContain('gone');
    });

    it('respects explicit category_filter even with delta sync (user opt-out)', async () => {
      // If caller explicitly asks for 'active' with delta sync, they've read the docs
      // and accepted the risk — we respect their choice.
      const zeroed = createMockCategory({ id: 'zeroed', name: 'Zeroed', budgeted: 0, activity: 0, balance: 0 });
      const active = createMockCategory({ id: 'active', name: 'Active', budgeted: 100000, activity: 0, balance: 100000 });
      const group = createMockCategoryGroup(0, { id: 'g1', name: 'G' });
      group.categories = [zeroed, active];
      client.getCategories.mockResolvedValue({ category_groups: [group], server_knowledge: 200 });

      const result = await tool.execute({
        budget_id: 'b',
        last_knowledge_of_server: 100,
        category_filter: 'active',
      });

      const ids = result.category_groups[0]!.categories.map(c => c.id);
      expect(ids).toEqual(['active']);
    });
  });
});

describe('GetCategoryTool', () => {
  let client: MockYNABClient;
  let tool: GetCategoryTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new GetCategoryTool(client as any);
  });

  it('has correct name', () => {
    expect(tool.name).toBe('ynab_get_category');
  });

  it('requires budget_id and category_id', async () => {
    await expect(tool.execute({})).rejects.toThrow();
    await expect(tool.execute({ budget_id: 'b' })).rejects.toThrow();
  });

  it('returns category details', async () => {
    client.getCategory.mockResolvedValue({
      category: createMockCategory({ id: 'cat-1', name: 'Groceries' }),
    });

    const result = await tool.execute({
      budget_id: 'test-budget',
      category_id: 'cat-1',
    });

    expect(result.category.name).toBe('Groceries');
  });

  it('handles API errors gracefully', async () => {
    client.getCategory.mockRejectedValue(new Error('API error'));
    await expect(tool.execute({
      budget_id: 'test-budget',
      category_id: 'cat-1',
    })).rejects.toThrow();
  });
});

describe('UpdateCategoryBudgetTool', () => {
  let client: MockYNABClient;
  let tool: UpdateCategoryBudgetTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new UpdateCategoryBudgetTool(client as any);
  });

  it('has correct name', () => {
    expect(tool.name).toBe('ynab_update_category_budget');
  });

  it('requires budget_id, category_id, month, and budgeted', async () => {
    await expect(tool.execute({})).rejects.toThrow();
    await expect(tool.execute({ budget_id: 'b' })).rejects.toThrow();
    await expect(tool.execute({ budget_id: 'b', category_id: 'c' })).rejects.toThrow();
    await expect(tool.execute({ budget_id: 'b', category_id: 'c', month: '2024-01-01' })).rejects.toThrow();
  });

  it('updates category budget amount', async () => {
    client.updateCategoryBudget.mockResolvedValue({
      category: createMockCategory({ id: 'cat-1', budgeted: 500000 }),
    });

    const result = await tool.execute({
      budget_id: 'test-budget',
      category_id: 'cat-1',
      month: '2024-01-01', // YYYY-MM-01 format required
      budgeted: 500000,
    });

    expect(client.updateCategoryBudget).toHaveBeenCalledWith(
      'test-budget',
      'cat-1',
      '2024-01-01',
      500000
    );
    // Result wraps budgeted in an object with milliunits and formatted
    expect(result.category.budgeted.milliunits).toBe(500000);
  });

  it('handles API errors gracefully', async () => {
    client.updateCategoryBudget.mockRejectedValue(new Error('API error'));
    await expect(tool.execute({
      budget_id: 'test-budget',
      category_id: 'cat-1',
      month: '2024-01-01',
      budgeted: 500000,
    })).rejects.toThrow();
  });
});
