/**
 * Analysis Tools Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AnalyzeSpendingPatternsTool } from '../../../src/tools/analysis/analyzeSpendingPatterns.js';
import { DistributeToBebudgetedTool } from '../../../src/tools/analysis/distributeToBebudgeted.js';
import { RecommendCategoryAllocationTool } from '../../../src/tools/analysis/recommendCategoryAllocation.js';
import { createMockClient, type MockYNABClient } from '../../helpers/mockClient.js';
import { createMockCategory, createMockCategoryGroup, createMockTransaction } from '../../helpers/fixtures.js';

describe('AnalyzeSpendingPatternsTool', () => {
  let client: MockYNABClient;
  let tool: AnalyzeSpendingPatternsTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new AnalyzeSpendingPatternsTool(client as any);
  });

  it('has correct name', () => {
    expect(tool.name).toBe('ynab_analyze_spending_patterns');
  });

  it('requires budget_id', async () => {
    await expect(tool.execute({})).rejects.toThrow();
  });

  it('analyzes spending patterns for budget', async () => {
    // Setup mock categories
    const categoryGroup = createMockCategoryGroup(2, { name: 'Bills' });
    client.getCategories.mockResolvedValue({
      category_groups: [categoryGroup],
      server_knowledge: 1,
    });

    // Setup mock transactions over multiple months
    const transactions = [
      createMockTransaction({
        id: 'tx-1',
        amount: -50000,
        date: '2024-01-15',
        category_id: categoryGroup.categories[0].id,
        category_name: categoryGroup.categories[0].name,
      }),
      createMockTransaction({
        id: 'tx-2',
        amount: -45000,
        date: '2024-02-15',
        category_id: categoryGroup.categories[0].id,
        category_name: categoryGroup.categories[0].name,
      }),
      createMockTransaction({
        id: 'tx-3',
        amount: -55000,
        date: '2024-03-15',
        category_id: categoryGroup.categories[0].id,
        category_name: categoryGroup.categories[0].name,
      }),
      createMockTransaction({
        id: 'tx-4',
        amount: -30000,
        date: '2024-01-20',
        category_id: categoryGroup.categories[1].id,
        category_name: categoryGroup.categories[1].name,
      }),
      createMockTransaction({
        id: 'tx-5',
        amount: -35000,
        date: '2024-02-20',
        category_id: categoryGroup.categories[1].id,
        category_name: categoryGroup.categories[1].name,
      }),
    ];

    client.getTransactions.mockResolvedValue({
      transactions,
      server_knowledge: 1,
    });

    const result = await tool.execute({
      budget_id: 'test-budget',
      analysis_months: 3,
      min_transactions: 2,
    });

    expect(result.patterns).toBeDefined();
    expect(result.summary).toBeDefined();
    expect(result.summary.total_categories_analyzed).toBeGreaterThanOrEqual(0);
  });

  it('filters by minimum transactions', async () => {
    const categoryGroup = createMockCategoryGroup(1, { name: 'Bills' });
    client.getCategories.mockResolvedValue({
      category_groups: [categoryGroup],
      server_knowledge: 1,
    });

    // Only one transaction - should be filtered out with min_transactions: 5
    client.getTransactions.mockResolvedValue({
      transactions: [createMockTransaction({
        id: 'tx-1',
        amount: -50000,
        category_id: categoryGroup.categories[0].id,
      })],
      server_knowledge: 1,
    });

    const result = await tool.execute({
      budget_id: 'test-budget',
      analysis_months: 6,
      min_transactions: 5, // Requires at least 5 transactions
    });

    // No categories should meet the minimum transaction threshold
    expect(result.patterns.length).toBe(0);
  });

  it('handles API errors gracefully', async () => {
    client.getCategories.mockRejectedValue(new Error('API error'));

    await expect(tool.execute({
      budget_id: 'test-budget',
    })).rejects.toThrow('analyze spending patterns failed');
  });
});

describe('DistributeToBebudgetedTool', () => {
  let client: MockYNABClient;
  let tool: DistributeToBebudgetedTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new DistributeToBebudgetedTool(client as any);
  });

  it('has correct name', () => {
    expect(tool.name).toBe('ynab_distribute_to_be_budgeted');
  });

  it('requires budget_id and month', async () => {
    await expect(tool.execute({})).rejects.toThrow();
    await expect(tool.execute({ budget_id: 'b' })).rejects.toThrow();
  });

  it('generates distribution plan in dry run mode', async () => {
    // Setup mock budget month with to_be_budgeted
    client.getBudgetMonth.mockResolvedValue({
      month: {
        month: '2024-01-01',
        note: null,
        income: 500000,
        budgeted: 400000,
        activity: -350000,
        to_be_budgeted: 100000,
        age_of_money: 45,
        deleted: false,
        categories: [
          createMockCategory({
            id: 'cat-1',
            name: 'Groceries',
            budgeted: 100000,
            balance: 50000,
            goal_type: 'NEED',
            goal_target: 200000,
          }),
          createMockCategory({
            id: 'cat-2',
            name: 'Rent',
            budgeted: 200000,
            balance: 0,
          }),
        ],
      },
      server_knowledge: 1,
    });

    // Setup mock categories
    const categoryGroup = createMockCategoryGroup(0, { name: 'Bills' });
    categoryGroup.categories = [
      createMockCategory({ id: 'cat-1', name: 'Groceries' }),
      createMockCategory({ id: 'cat-2', name: 'Rent' }),
    ];
    client.getCategories.mockResolvedValue({
      category_groups: [categoryGroup],
      server_knowledge: 1,
    });

    // Setup transactions for spending analysis
    client.getTransactions.mockResolvedValue({
      transactions: [
        createMockTransaction({ category_id: 'cat-1', amount: -50000, date: '2024-01-01' }),
        createMockTransaction({ category_id: 'cat-2', amount: -200000, date: '2024-01-01' }),
      ],
      server_knowledge: 1,
    });

    const result = await tool.execute({
      budget_id: 'test-budget',
      month: '2024-01-01',
      dry_run: true,
    });

    expect(result.distribution_plan).toBeDefined();
    expect(result.execution_summary).toBeDefined();
    expect(result.execution_summary.was_executed).toBe(false);
  });

  it('handles zero to-be-budgeted', async () => {
    client.getBudgetMonth.mockResolvedValue({
      month: {
        month: '2024-01-01',
        note: null,
        income: 500000,
        budgeted: 500000,
        activity: -350000,
        to_be_budgeted: 0, // Nothing to distribute
        age_of_money: 45,
        deleted: false,
        categories: [],
      },
      server_knowledge: 1,
    });

    client.getCategories.mockResolvedValue({
      category_groups: [],
      server_knowledge: 1,
    });

    client.getTransactions.mockResolvedValue({
      transactions: [],
      server_knowledge: 1,
    });

    const result = await tool.execute({
      budget_id: 'test-budget',
      month: '2024-01-01',
    });

    expect(result.execution_summary.total_distributed.milliunits).toBe(0);
  });

  it('handles API errors gracefully', async () => {
    client.getBudgetMonth.mockRejectedValue(new Error('API error'));

    await expect(tool.execute({
      budget_id: 'test-budget',
      month: '2024-01-01',
    })).rejects.toThrow();
  });
});

describe('RecommendCategoryAllocationTool', () => {
  let client: MockYNABClient;
  let tool: RecommendCategoryAllocationTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new RecommendCategoryAllocationTool(client as any);
  });

  it('has correct name', () => {
    expect(tool.name).toBe('ynab_recommend_category_allocation');
  });

  it('requires budget_id', async () => {
    await expect(tool.execute({})).rejects.toThrow();
  });

  it('generates allocation recommendations', async () => {
    // Setup mock categories
    const categoryGroup = createMockCategoryGroup(0, { name: 'Bills' });
    categoryGroup.categories = [
      createMockCategory({
        id: 'cat-1',
        name: 'Groceries',
        budgeted: 100000,
        activity: -80000,
        balance: 20000,
      }),
    ];
    client.getCategories.mockResolvedValue({
      category_groups: [categoryGroup],
      server_knowledge: 1,
    });

    // Setup transactions for analysis
    const transactions = [
      createMockTransaction({ id: 'tx-1', category_id: 'cat-1', amount: -50000, date: '2024-01-15' }),
      createMockTransaction({ id: 'tx-2', category_id: 'cat-1', amount: -30000, date: '2024-02-15' }),
      createMockTransaction({ id: 'tx-3', category_id: 'cat-1', amount: -40000, date: '2024-03-15' }),
    ];
    client.getTransactions.mockResolvedValue({
      transactions,
      server_knowledge: 1,
    });

    const result = await tool.execute({
      budget_id: 'test-budget',
    });

    expect(result.recommendations).toBeDefined();
    expect(result.summary).toBeDefined();
  });

  it('filters by category_ids when provided', async () => {
    const categoryGroup = createMockCategoryGroup(0, { name: 'Bills' });
    categoryGroup.categories = [
      createMockCategory({ id: 'cat-1', name: 'Groceries' }),
      createMockCategory({ id: 'cat-2', name: 'Utilities' }),
    ];
    client.getCategories.mockResolvedValue({
      category_groups: [categoryGroup],
      server_knowledge: 1,
    });

    client.getTransactions.mockResolvedValue({
      transactions: [
        createMockTransaction({ category_id: 'cat-1', amount: -50000, date: '2024-01-15' }),
        createMockTransaction({ category_id: 'cat-1', amount: -50000, date: '2024-02-15' }),
        createMockTransaction({ category_id: 'cat-1', amount: -50000, date: '2024-03-15' }),
        createMockTransaction({ category_id: 'cat-2', amount: -30000, date: '2024-01-15' }),
        createMockTransaction({ category_id: 'cat-2', amount: -30000, date: '2024-02-15' }),
        createMockTransaction({ category_id: 'cat-2', amount: -30000, date: '2024-03-15' }),
      ],
      server_knowledge: 1,
    });

    const result = await tool.execute({
      budget_id: 'test-budget',
      category_ids: ['cat-1'], // Only analyze Groceries
    });

    // Should only have recommendation for cat-1
    const catIds = result.recommendations.map(r => r.category_id);
    expect(catIds).toContain('cat-1');
    expect(catIds).not.toContain('cat-2');
  });

  it('handles API errors gracefully', async () => {
    client.getCategories.mockRejectedValue(new Error('API error'));

    await expect(tool.execute({
      budget_id: 'test-budget',
    })).rejects.toThrow();
  });
});
