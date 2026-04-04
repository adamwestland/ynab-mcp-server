/**
 * GetTransactionsTool Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GetTransactionsTool } from '../../../src/tools/transactions/getTransactions.js';
import { createMockClient, type MockYNABClient } from '../../helpers/mockClient.js';
import { createMockTransaction, createMockSplitTransaction } from '../../helpers/fixtures.js';

describe('GetTransactionsTool', () => {
  let client: MockYNABClient;
  let tool: GetTransactionsTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new GetTransactionsTool(client as any);
  });

  describe('metadata', () => {
    it('has correct name', () => {
      expect(tool.name).toBe('ynab_get_transactions');
    });

    it('has description', () => {
      expect(tool.description).toBeTruthy();
    });
  });

  describe('execute', () => {
    it('requires budget_id', async () => {
      await expect(tool.execute({})).rejects.toThrow();
    });

    it('returns empty list when no transactions exist', async () => {
      client.getTransactions.mockResolvedValue({
        transactions: [],
        server_knowledge: 1,
      });

      const result = await tool.execute({ budget_id: 'test-budget' });

      expect(result.transactions).toEqual([]);
      expect(result.filtered_count).toBe(0);
    });

    it('returns transactions with formatted amounts', async () => {
      client.getTransactions.mockResolvedValue({
        transactions: [createMockTransaction({
          id: 'tx-1',
          amount: -50000,
        })],
        server_knowledge: 1,
      });

      const result = await tool.execute({ budget_id: 'test-budget' });

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].amount.milliunits).toBe(-50000);
      expect(result.transactions[0].amount.formatted).toBe('$-50.00');
    });

    it('includes payee and category info', async () => {
      client.getTransactions.mockResolvedValue({
        transactions: [createMockTransaction({
          payee_id: 'payee-1',
          payee_name: 'Test Payee',
          category_id: 'cat-1',
          category_name: 'Groceries',
        })],
        server_knowledge: 1,
      });

      const result = await tool.execute({ budget_id: 'test-budget' });

      expect(result.transactions[0].payee.id).toBe('payee-1');
      expect(result.transactions[0].payee.name).toBe('Test Payee');
      expect(result.transactions[0].category.id).toBe('cat-1');
      expect(result.transactions[0].category.name).toBe('Groceries');
    });

    it('includes transfer info when present', async () => {
      client.getTransactions.mockResolvedValue({
        transactions: [createMockTransaction({
          transfer_account_id: 'acct-2',
          transfer_transaction_id: 'tx-linked',
        })],
        server_knowledge: 1,
      });

      const result = await tool.execute({ budget_id: 'test-budget' });

      expect(result.transactions[0].transfer).not.toBeNull();
      expect(result.transactions[0].transfer?.account_id).toBe('acct-2');
      expect(result.transactions[0].transfer?.transaction_id).toBe('tx-linked');
    });

    it('filters by account_id using getAccountTransactions', async () => {
      client.getAccountTransactions.mockResolvedValue({
        transactions: [createMockTransaction({ account_id: 'acct-1' })],
        server_knowledge: 1,
      });

      await tool.execute({
        budget_id: 'test-budget',
        account_id: 'acct-1',
      });

      expect(client.getAccountTransactions).toHaveBeenCalledWith(
        'test-budget',
        'acct-1',
        expect.any(Object)
      );
      expect(client.getTransactions).not.toHaveBeenCalled();
    });

    it('filters by category_id', async () => {
      client.getTransactions.mockResolvedValue({
        transactions: [
          createMockTransaction({ id: '1', category_id: 'cat-1' }),
          createMockTransaction({ id: '2', category_id: 'cat-2' }),
        ],
        server_knowledge: 1,
      });

      const result = await tool.execute({
        budget_id: 'test-budget',
        category_id: 'cat-1',
      });

      expect(result.filtered_count).toBe(1);
      expect(result.transactions[0].category.id).toBe('cat-1');
    });

    it('filters by payee_id', async () => {
      client.getTransactions.mockResolvedValue({
        transactions: [
          createMockTransaction({ id: '1', payee_id: 'payee-1' }),
          createMockTransaction({ id: '2', payee_id: 'payee-2' }),
        ],
        server_knowledge: 1,
      });

      const result = await tool.execute({
        budget_id: 'test-budget',
        payee_id: 'payee-1',
      });

      expect(result.filtered_count).toBe(1);
      expect(result.transactions[0].payee.id).toBe('payee-1');
    });

    it('filters by cleared_status', async () => {
      client.getTransactions.mockResolvedValue({
        transactions: [
          createMockTransaction({ id: '1', cleared: 'cleared' }),
          createMockTransaction({ id: '2', cleared: 'uncleared' }),
        ],
        server_knowledge: 1,
      });

      const result = await tool.execute({
        budget_id: 'test-budget',
        cleared_status: 'cleared',
      });

      expect(result.filtered_count).toBe(1);
      expect(result.transactions[0].cleared).toBe('cleared');
    });

    it('applies limit', async () => {
      client.getTransactions.mockResolvedValue({
        transactions: [
          createMockTransaction({ id: '1' }),
          createMockTransaction({ id: '2' }),
          createMockTransaction({ id: '3' }),
        ],
        server_knowledge: 1,
      });

      const result = await tool.execute({
        budget_id: 'test-budget',
        limit: 2,
      });

      expect(result.filtered_count).toBe(2);
      expect(result.has_more).toBe(true);
    });

    it('includes subtransactions by default', async () => {
      const splitTx = createMockSplitTransaction(2);
      client.getTransactions.mockResolvedValue({
        transactions: [splitTx],
        server_knowledge: 1,
      });

      const result = await tool.execute({ budget_id: 'test-budget' });

      expect(result.transactions[0].subtransactions).toBeDefined();
      expect(result.transactions[0].subtransactions).toHaveLength(2);
    });

    it('excludes subtransactions when include_subtransactions is false', async () => {
      const splitTx = createMockSplitTransaction(2);
      client.getTransactions.mockResolvedValue({
        transactions: [splitTx],
        server_knowledge: 1,
      });

      const result = await tool.execute({
        budget_id: 'test-budget',
        include_subtransactions: false,
      });

      expect(result.transactions[0].subtransactions).toBeUndefined();
    });

    it('passes since_date to API', async () => {
      client.getTransactions.mockResolvedValue({
        transactions: [],
        server_knowledge: 1,
      });

      await tool.execute({
        budget_id: 'test-budget',
        since_date: '2024-01-01',
      });

      expect(client.getTransactions).toHaveBeenCalledWith(
        'test-budget',
        expect.objectContaining({ sinceDate: '2024-01-01' })
      );
    });

    it('passes type filter to API', async () => {
      client.getTransactions.mockResolvedValue({
        transactions: [],
        server_knowledge: 1,
      });

      await tool.execute({
        budget_id: 'test-budget',
        type: 'unapproved',
      });

      expect(client.getTransactions).toHaveBeenCalledWith(
        'test-budget',
        expect.objectContaining({ type: 'unapproved' })
      );
    });

    it('sorts transactions by date (newest first)', async () => {
      client.getTransactions.mockResolvedValue({
        transactions: [
          createMockTransaction({ id: '1', date: '2024-01-01' }),
          createMockTransaction({ id: '2', date: '2024-01-15' }),
          createMockTransaction({ id: '3', date: '2024-01-10' }),
        ],
        server_knowledge: 1,
      });

      const result = await tool.execute({ budget_id: 'test-budget' });

      expect(result.transactions[0].date).toBe('2024-01-15');
      expect(result.transactions[1].date).toBe('2024-01-10');
      expect(result.transactions[2].date).toBe('2024-01-01');
    });

    it('returns server_knowledge for delta sync', async () => {
      client.getTransactions.mockResolvedValue({
        transactions: [],
        server_knowledge: 12345,
      });

      const result = await tool.execute({ budget_id: 'test-budget' });

      expect(result.server_knowledge).toBe(12345);
    });

    it('handles API errors gracefully', async () => {
      client.getTransactions.mockRejectedValue(new Error('API error'));

      await expect(tool.execute({ budget_id: 'test-budget' }))
        .rejects.toThrow('get transactions failed');
    });
  });

  describe('compact mode', () => {
    const COMPACT_KEYS = ['id', 'date', 'amount', 'memo', 'payee', 'category', 'account', 'cleared', 'approved'];

    beforeEach(() => {
      client.getTransactions.mockResolvedValue({
        transactions: [createMockTransaction({
          id: 'tx-1',
          amount: -50000,
          flag_color: 'red',
          import_id: 'import-1',
          import_payee_name: 'Original',
          transfer_account_id: 'acct-2',
          transfer_transaction_id: 'tx-linked',
        })],
        server_knowledge: 1,
      });
    });

    it('returns only compact fields when compact=true', async () => {
      const result = await tool.execute({ budget_id: 'test-budget', compact: true });
      const tx = result.transactions[0];
      const keys = Object.keys(tx);

      expect(keys.sort()).toEqual(COMPACT_KEYS.sort());
    });

    it('omits transfer, flag, import_info, matched_transaction_id, debt_transaction_type when compact=true', async () => {
      const result = await tool.execute({ budget_id: 'test-budget', compact: true });
      const tx = result.transactions[0] as Record<string, unknown>;

      expect(tx).not.toHaveProperty('transfer');
      expect(tx).not.toHaveProperty('flag');
      expect(tx).not.toHaveProperty('import_info');
      expect(tx).not.toHaveProperty('matched_transaction_id');
      expect(tx).not.toHaveProperty('debt_transaction_type');
    });

    it('omits subtransactions when compact=true even for split transactions', async () => {
      const splitTx = createMockSplitTransaction(2);
      client.getTransactions.mockResolvedValue({
        transactions: [splitTx],
        server_knowledge: 1,
      });

      const result = await tool.execute({ budget_id: 'test-budget', compact: true });
      const tx = result.transactions[0] as Record<string, unknown>;

      expect(tx).not.toHaveProperty('subtransactions');
    });

    it('returns all fields when compact=false (default behavior)', async () => {
      const result = await tool.execute({ budget_id: 'test-budget', compact: false });
      const tx = result.transactions[0] as Record<string, unknown>;

      expect(tx).toHaveProperty('transfer');
      expect(tx).toHaveProperty('flag');
      expect(tx).toHaveProperty('import_info');
    });
  });

  describe('fields parameter', () => {
    beforeEach(() => {
      client.getTransactions.mockResolvedValue({
        transactions: [createMockTransaction({
          id: 'tx-1',
          amount: -50000,
          flag_color: 'blue',
          import_id: 'imp-1',
          transfer_account_id: 'acct-2',
          transfer_transaction_id: 'tx-linked',
        })],
        server_knowledge: 1,
      });
    });

    it('returns only specified fields', async () => {
      const result = await tool.execute({
        budget_id: 'test-budget',
        fields: ['id', 'date', 'amount'],
      });
      const tx = result.transactions[0];
      const keys = Object.keys(tx);

      expect(keys.sort()).toEqual(['amount', 'date', 'id']);
    });

    it('fields takes precedence over compact', async () => {
      const result = await tool.execute({
        budget_id: 'test-budget',
        compact: true,
        fields: ['id', 'amount'],
      });
      const tx = result.transactions[0];
      const keys = Object.keys(tx);

      expect(keys.sort()).toEqual(['amount', 'id']);
    });

    it('includes subtransactions when requested in fields', async () => {
      const splitTx = createMockSplitTransaction(2);
      client.getTransactions.mockResolvedValue({
        transactions: [splitTx],
        server_knowledge: 1,
      });

      const result = await tool.execute({
        budget_id: 'test-budget',
        fields: ['id', 'subtransactions'],
      });
      const tx = result.transactions[0] as Record<string, unknown>;

      expect(tx).toHaveProperty('subtransactions');
      expect(Object.keys(tx).sort()).toEqual(['id', 'subtransactions']);
    });

    it('excludes subtransactions when not in fields even if include_subtransactions=true', async () => {
      const splitTx = createMockSplitTransaction(2);
      client.getTransactions.mockResolvedValue({
        transactions: [splitTx],
        server_knowledge: 1,
      });

      const result = await tool.execute({
        budget_id: 'test-budget',
        fields: ['id', 'amount'],
        include_subtransactions: true,
      });
      const tx = result.transactions[0] as Record<string, unknown>;

      expect(tx).not.toHaveProperty('subtransactions');
    });

    it('rejects empty fields array', async () => {
      await expect(tool.execute({
        budget_id: 'test-budget',
        fields: [],
      })).rejects.toThrow();
    });
  });
});
