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
