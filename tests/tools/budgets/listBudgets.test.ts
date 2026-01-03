/**
 * ListBudgetsTool Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ListBudgetsTool } from '../../../src/tools/budgets/listBudgets.js';
import { createMockClient, type MockYNABClient } from '../../helpers/mockClient.js';
import { createMockBudget, createMockAccount } from '../../helpers/fixtures.js';

describe('ListBudgetsTool', () => {
  let client: MockYNABClient;
  let tool: ListBudgetsTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new ListBudgetsTool(client as any);
  });

  describe('metadata', () => {
    it('has correct name', () => {
      expect(tool.name).toBe('ynab_list_budgets');
    });

    it('has description', () => {
      expect(tool.description).toBeTruthy();
      expect(tool.description).toContain('budget');
    });
  });

  describe('execute', () => {
    it('returns empty list when no budgets exist', async () => {
      client.getBudgets.mockResolvedValue({
        budgets: [],
        default_budget: null,
      });

      const result = await tool.execute({});

      expect(result.budgets).toEqual([]);
      expect(result.total_budgets).toBe(0);
      expect(result.default_budget_id).toBeNull();
    });

    it('returns list of budgets with metadata', async () => {
      const mockBudget = createMockBudget({ id: 'budget-1', name: 'My Budget' });
      client.getBudgets.mockResolvedValue({
        budgets: [mockBudget],
        default_budget: mockBudget,
      });

      const result = await tool.execute({});

      expect(result.budgets).toHaveLength(1);
      expect(result.budgets[0].id).toBe('budget-1');
      expect(result.budgets[0].name).toBe('My Budget');
      expect(result.budgets[0].is_default).toBe(true);
      expect(result.default_budget_id).toBe('budget-1');
      expect(result.total_budgets).toBe(1);
    });

    it('includes currency format information', async () => {
      const mockBudget = createMockBudget();
      client.getBudgets.mockResolvedValue({
        budgets: [mockBudget],
        default_budget: null,
      });

      const result = await tool.execute({});

      expect(result.budgets[0].currency_format).toBeDefined();
      expect(result.budgets[0].currency_format.iso_code).toBe('USD');
      expect(result.budgets[0].currency_format.currency_symbol).toBe('$');
    });

    it('includes date format information', async () => {
      const mockBudget = createMockBudget();
      client.getBudgets.mockResolvedValue({
        budgets: [mockBudget],
        default_budget: null,
      });

      const result = await tool.execute({});

      expect(result.budgets[0].date_format).toBeDefined();
      expect(result.budgets[0].date_format.format).toBe('MM/DD/YYYY');
    });

    it('includes account counts when include_accounts is true', async () => {
      const mockBudget = createMockBudget({ id: 'budget-1' });
      client.getBudgets.mockResolvedValue({
        budgets: [mockBudget],
        default_budget: null,
      });
      client.getAccounts.mockResolvedValue({
        accounts: [
          createMockAccount({ on_budget: true }),
          createMockAccount({ on_budget: true }),
          createMockAccount({ on_budget: false }),
        ],
        server_knowledge: 1,
      });

      const result = await tool.execute({ include_accounts: true });

      expect(result.budgets[0].accounts_count).toBe(3);
      expect(result.budgets[0].on_budget_accounts_count).toBe(2);
      expect(client.getAccounts).toHaveBeenCalledWith('budget-1');
    });

    it('does not include account counts when include_accounts is false', async () => {
      const mockBudget = createMockBudget();
      client.getBudgets.mockResolvedValue({
        budgets: [mockBudget],
        default_budget: null,
      });

      const result = await tool.execute({ include_accounts: false });

      expect(result.budgets[0].accounts_count).toBeUndefined();
      expect(client.getAccounts).not.toHaveBeenCalled();
    });

    it('sorts budgets with default first, then alphabetically', async () => {
      const budgetA = createMockBudget({ id: 'a', name: 'Zebra Budget' });
      const budgetB = createMockBudget({ id: 'b', name: 'Alpha Budget' });
      const budgetC = createMockBudget({ id: 'c', name: 'Default Budget' });

      client.getBudgets.mockResolvedValue({
        budgets: [budgetA, budgetB, budgetC],
        default_budget: budgetA, // Zebra is default
      });

      const result = await tool.execute({});

      expect(result.budgets[0].name).toBe('Zebra Budget'); // Default first
      expect(result.budgets[1].name).toBe('Alpha Budget'); // Then alphabetical
      expect(result.budgets[2].name).toBe('Default Budget');
    });

    it('handles API errors gracefully', async () => {
      client.getBudgets.mockRejectedValue(new Error('API error'));

      await expect(tool.execute({})).rejects.toThrow('list budgets failed');
    });

    it('handles account fetch errors gracefully', async () => {
      const mockBudget = createMockBudget({ id: 'budget-1' });
      client.getBudgets.mockResolvedValue({
        budgets: [mockBudget],
        default_budget: null,
      });
      client.getAccounts.mockRejectedValue(new Error('Account fetch failed'));

      // Should not throw, just omit account counts
      const result = await tool.execute({ include_accounts: true });

      expect(result.budgets[0].accounts_count).toBeUndefined();
    });

    it('accepts undefined args', async () => {
      client.getBudgets.mockResolvedValue({
        budgets: [],
        default_budget: null,
      });

      const result = await tool.execute(undefined);

      expect(result.budgets).toEqual([]);
    });
  });
});
