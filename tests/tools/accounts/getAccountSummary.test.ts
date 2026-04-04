/**
 * GetAccountSummaryTool Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GetAccountSummaryTool } from '../../../src/tools/accounts/getAccountSummary.js';
import { createMockClient, type MockYNABClient } from '../../helpers/mockClient.js';
import { createMockAccount, createMockTransaction } from '../../helpers/fixtures.js';

describe('GetAccountSummaryTool', () => {
  let client: MockYNABClient;
  let tool: GetAccountSummaryTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new GetAccountSummaryTool(client as any);
  });

  describe('metadata', () => {
    it('has correct name', () => {
      expect(tool.name).toBe('ynab_get_account_summary');
    });

    it('has description', () => {
      expect(tool.description).toBeTruthy();
    });
  });

  describe('execute', () => {
    it('requires budget_id', async () => {
      await expect(tool.execute({})).rejects.toThrow();
    });

    it('returns empty accounts with zero totals for empty budget', async () => {
      client.getAccounts.mockResolvedValue({
        accounts: [],
        server_knowledge: 1,
      });
      client.getTransactions
        .mockResolvedValueOnce({ transactions: [], server_knowledge: 1 })
        .mockResolvedValueOnce({ transactions: [], server_knowledge: 1 });

      const result = await tool.execute({ budget_id: 'test-budget' });

      expect(result.accounts).toEqual([]);
      expect(result.totals.total_unapproved).toBe(0);
      expect(result.totals.total_uncategorized).toBe(0);
      expect(result.account_count).toBe(0);
    });

    it('counts unapproved and uncategorized per account', async () => {
      const acct1 = createMockAccount({ id: 'acct-1', name: 'Checking' });
      const acct2 = createMockAccount({ id: 'acct-2', name: 'Savings' });

      client.getAccounts.mockResolvedValue({
        accounts: [acct1, acct2],
        server_knowledge: 1,
      });

      // Unapproved: 2 in acct-1, 1 in acct-2
      client.getTransactions.mockResolvedValueOnce({
        transactions: [
          createMockTransaction({ account_id: 'acct-1', approved: false }),
          createMockTransaction({ account_id: 'acct-1', approved: false }),
          createMockTransaction({ account_id: 'acct-2', approved: false }),
        ],
        server_knowledge: 1,
      });

      // Uncategorized: 0 in acct-1, 3 in acct-2
      client.getTransactions.mockResolvedValueOnce({
        transactions: [
          createMockTransaction({ account_id: 'acct-2', category_id: null }),
          createMockTransaction({ account_id: 'acct-2', category_id: null }),
          createMockTransaction({ account_id: 'acct-2', category_id: null }),
        ],
        server_knowledge: 1,
      });

      const result = await tool.execute({ budget_id: 'test-budget' });

      const checking = result.accounts.find((a: any) => a.id === 'acct-1');
      const savings = result.accounts.find((a: any) => a.id === 'acct-2');

      expect(checking.unapproved_count).toBe(2);
      expect(checking.uncategorized_count).toBe(0);
      expect(savings.unapproved_count).toBe(1);
      expect(savings.uncategorized_count).toBe(3);
    });

    it('shows zero counts for accounts with no action items', async () => {
      const acct = createMockAccount({ id: 'acct-1', name: 'Clean Account' });

      client.getAccounts.mockResolvedValue({
        accounts: [acct],
        server_knowledge: 1,
      });
      client.getTransactions
        .mockResolvedValueOnce({ transactions: [], server_knowledge: 1 })
        .mockResolvedValueOnce({ transactions: [], server_knowledge: 1 });

      const result = await tool.execute({ budget_id: 'test-budget' });

      expect(result.accounts[0].unapproved_count).toBe(0);
      expect(result.accounts[0].uncategorized_count).toBe(0);
    });

    it('excludes closed accounts by default', async () => {
      const open = createMockAccount({ id: 'acct-1', name: 'Open', closed: false });
      const closed = createMockAccount({ id: 'acct-2', name: 'Closed', closed: true });

      client.getAccounts.mockResolvedValue({
        accounts: [open, closed],
        server_knowledge: 1,
      });
      client.getTransactions
        .mockResolvedValueOnce({ transactions: [], server_knowledge: 1 })
        .mockResolvedValueOnce({ transactions: [], server_knowledge: 1 });

      const result = await tool.execute({ budget_id: 'test-budget' });

      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0].name).toBe('Open');
    });

    it('includes closed accounts when include_closed=true', async () => {
      const open = createMockAccount({ id: 'acct-1', name: 'Open', closed: false });
      const closed = createMockAccount({ id: 'acct-2', name: 'Closed', closed: true });

      client.getAccounts.mockResolvedValue({
        accounts: [open, closed],
        server_knowledge: 1,
      });
      client.getTransactions
        .mockResolvedValueOnce({ transactions: [], server_knowledge: 1 })
        .mockResolvedValueOnce({ transactions: [], server_knowledge: 1 });

      const result = await tool.execute({ budget_id: 'test-budget', include_closed: true });

      expect(result.accounts).toHaveLength(2);
    });

    it('filters to on-budget only when on_budget_only=true', async () => {
      const onBudget = createMockAccount({ id: 'acct-1', name: 'On Budget', on_budget: true });
      const offBudget = createMockAccount({ id: 'acct-2', name: 'Off Budget', on_budget: false });

      client.getAccounts.mockResolvedValue({
        accounts: [onBudget, offBudget],
        server_knowledge: 1,
      });
      client.getTransactions
        .mockResolvedValueOnce({ transactions: [], server_knowledge: 1 })
        .mockResolvedValueOnce({ transactions: [], server_knowledge: 1 });

      const result = await tool.execute({ budget_id: 'test-budget', on_budget_only: true });

      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0].name).toBe('On Budget');
    });

    it('calculates correct totals', async () => {
      const acct1 = createMockAccount({ id: 'acct-1', balance: 1000000 });
      const acct2 = createMockAccount({ id: 'acct-2', balance: 2000000 });

      client.getAccounts.mockResolvedValue({
        accounts: [acct1, acct2],
        server_knowledge: 1,
      });

      client.getTransactions.mockResolvedValueOnce({
        transactions: [
          createMockTransaction({ account_id: 'acct-1' }),
          createMockTransaction({ account_id: 'acct-2' }),
          createMockTransaction({ account_id: 'acct-2' }),
        ],
        server_knowledge: 1,
      });
      client.getTransactions.mockResolvedValueOnce({
        transactions: [
          createMockTransaction({ account_id: 'acct-1' }),
        ],
        server_knowledge: 1,
      });

      const result = await tool.execute({ budget_id: 'test-budget' });

      expect(result.totals.total_unapproved).toBe(3);
      expect(result.totals.total_uncategorized).toBe(1);
      expect(result.totals.total_balance.milliunits).toBe(3000000);
      expect(result.account_count).toBe(2);
    });

    it('includes api_calls_used in response', async () => {
      client.getAccounts.mockResolvedValue({ accounts: [], server_knowledge: 1 });
      client.getTransactions
        .mockResolvedValueOnce({ transactions: [], server_knowledge: 1 })
        .mockResolvedValueOnce({ transactions: [], server_knowledge: 1 });

      const result = await tool.execute({ budget_id: 'test-budget' });

      expect(result.api_calls_used).toBe(3);
    });

    it('makes all 3 API calls with correct params', async () => {
      client.getAccounts.mockResolvedValue({ accounts: [], server_knowledge: 1 });
      client.getTransactions
        .mockResolvedValueOnce({ transactions: [], server_knowledge: 1 })
        .mockResolvedValueOnce({ transactions: [], server_knowledge: 1 });

      await tool.execute({ budget_id: 'test-budget' });

      expect(client.getAccounts).toHaveBeenCalledWith('test-budget');
      expect(client.getTransactions).toHaveBeenCalledTimes(2);
      expect(client.getTransactions).toHaveBeenNthCalledWith(1, 'test-budget', { type: 'unapproved' });
      expect(client.getTransactions).toHaveBeenNthCalledWith(2, 'test-budget', { type: 'uncategorized' });
    });

    it('excludes on-budget transfers from uncategorized counts', async () => {
      const acct = createMockAccount({ id: 'acct-1', name: 'Checking' });

      client.getAccounts.mockResolvedValue({
        accounts: [acct],
        server_knowledge: 1,
      });

      // No unapproved
      client.getTransactions.mockResolvedValueOnce({
        transactions: [],
        server_knowledge: 1,
      });

      // Uncategorized: 3 total, but 2 are transfers (should be excluded)
      client.getTransactions.mockResolvedValueOnce({
        transactions: [
          createMockTransaction({ account_id: 'acct-1', category_id: null, transfer_account_id: null }),
          createMockTransaction({ account_id: 'acct-1', category_id: null, transfer_account_id: 'acct-2' }),
          createMockTransaction({ account_id: 'acct-1', category_id: null, transfer_account_id: 'acct-3' }),
        ],
        server_knowledge: 1,
      });

      const result = await tool.execute({ budget_id: 'test-budget' });

      expect(result.accounts[0].uncategorized_count).toBe(1);
      expect(result.totals.total_uncategorized).toBe(1);
    });

    it('handles API errors gracefully', async () => {
      client.getAccounts.mockRejectedValue(new Error('API error'));

      await expect(tool.execute({ budget_id: 'test-budget' }))
        .rejects.toThrow('get account summary failed');
    });
  });
});
