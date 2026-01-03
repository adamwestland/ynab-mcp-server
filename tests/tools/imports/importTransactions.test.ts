/**
 * ImportTransactionsTool Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ImportTransactionsTool } from '../../../src/tools/imports/importTransactions.js';
import { createMockClient, type MockYNABClient } from '../../helpers/mockClient.js';
import { createMockTransaction } from '../../helpers/fixtures.js';

describe('ImportTransactionsTool', () => {
  let client: MockYNABClient;
  let tool: ImportTransactionsTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new ImportTransactionsTool(client as any);
  });

  describe('metadata', () => {
    it('has correct name', () => {
      expect(tool.name).toBe('ynab_import_transactions');
    });

    it('has description mentioning deduplication', () => {
      expect(tool.description).toContain('deduplication');
    });
  });

  describe('input validation', () => {
    it('requires budget_id and transactions', async () => {
      await expect(tool.execute({})).rejects.toThrow();
      await expect(tool.execute({ budget_id: 'b' })).rejects.toThrow();
    });

    it('requires at least one transaction', async () => {
      await expect(tool.execute({
        budget_id: 'test-budget',
        transactions: [],
      })).rejects.toThrow();
    });

    it('requires import_id on each transaction', async () => {
      await expect(tool.execute({
        budget_id: 'test-budget',
        transactions: [{
          account_id: 'acct-1',
          amount: -50000,
          date: '2024-01-15',
          // missing import_id
        }],
      })).rejects.toThrow();
    });

    it('validates date format', async () => {
      await expect(tool.execute({
        budget_id: 'test-budget',
        transactions: [{
          account_id: 'acct-1',
          amount: -50000,
          date: 'invalid-date',
          import_id: 'imp-1',
        }],
      })).rejects.toThrow();
    });

    it('rejects duplicate import_ids within batch', async () => {
      await expect(tool.execute({
        budget_id: 'test-budget',
        transactions: [
          { account_id: 'acct-1', amount: -50000, date: '2024-01-15', import_id: 'dup-id' },
          { account_id: 'acct-1', amount: -30000, date: '2024-01-16', import_id: 'dup-id' },
        ],
      })).rejects.toThrow('Duplicate import_ids found within the batch');
    });
  });

  describe('execute', () => {
    it('imports single transaction', async () => {
      const mockTx = createMockTransaction({
        id: 'tx-1',
        amount: -50000,
        date: '2024-01-15',
        import_id: 'imp-1',
        account_id: 'acct-1',
        account_name: 'Checking',
        payee_name: 'Store',
      });

      client.createTransactions.mockResolvedValue({
        transactions: [mockTx],
        server_knowledge: 100,
      });

      const result = await tool.execute({
        budget_id: 'test-budget',
        transactions: [{
          account_id: 'acct-1',
          payee_name: 'Store',
          amount: -50000,
          date: '2024-01-15',
          import_id: 'imp-1',
        }],
      });

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].id).toBe('tx-1');
      expect(result.transactions[0].amount.milliunits).toBe(-50000);
      expect(result.transactions[0].import_info.id).toBe('imp-1');
      expect(result.import_summary.successfully_imported).toBe(1);
      expect(result.import_summary.duplicates_found).toBe(0);
    });

    it('imports multiple transactions', async () => {
      const mockTx1 = createMockTransaction({
        id: 'tx-1',
        import_id: 'imp-1',
        amount: -50000,
      });
      const mockTx2 = createMockTransaction({
        id: 'tx-2',
        import_id: 'imp-2',
        amount: -30000,
      });

      client.createTransactions.mockResolvedValue({
        transactions: [mockTx1, mockTx2],
        server_knowledge: 100,
      });

      const result = await tool.execute({
        budget_id: 'test-budget',
        transactions: [
          { account_id: 'acct-1', amount: -50000, date: '2024-01-15', import_id: 'imp-1' },
          { account_id: 'acct-1', amount: -30000, date: '2024-01-16', import_id: 'imp-2' },
        ],
      });

      expect(result.transactions).toHaveLength(2);
      expect(result.import_summary.total_submitted).toBe(2);
      expect(result.import_summary.successfully_imported).toBe(2);
    });

    it('detects duplicate imports from API response', async () => {
      // Only one transaction imported (the other was duplicate)
      const mockTx = createMockTransaction({
        id: 'tx-1',
        import_id: 'imp-1',
      });

      client.createTransactions.mockResolvedValue({
        transactions: [mockTx],
        server_knowledge: 100,
      });

      const result = await tool.execute({
        budget_id: 'test-budget',
        transactions: [
          { account_id: 'acct-1', amount: -50000, date: '2024-01-15', import_id: 'imp-1' },
          { account_id: 'acct-1', amount: -30000, date: '2024-01-16', import_id: 'imp-2' },
        ],
      });

      expect(result.transactions).toHaveLength(1);
      expect(result.duplicate_import_ids).toContain('imp-2');
      expect(result.import_summary.duplicates_found).toBe(1);
    });

    it('includes flag information when provided', async () => {
      const mockTx = createMockTransaction({
        id: 'tx-1',
        import_id: 'imp-1',
        flag_color: 'red',
        flag_name: null,
      });

      client.createTransactions.mockResolvedValue({
        transactions: [mockTx],
        server_knowledge: 100,
      });

      const result = await tool.execute({
        budget_id: 'test-budget',
        transactions: [{
          account_id: 'acct-1',
          amount: -50000,
          date: '2024-01-15',
          import_id: 'imp-1',
          flag_color: 'red',
        }],
      });

      expect(result.transactions[0].flag).not.toBeNull();
      expect(result.transactions[0].flag?.color).toBe('red');
    });

    it('returns server_knowledge', async () => {
      const mockTx = createMockTransaction({ id: 'tx-1', import_id: 'imp-1' });

      client.createTransactions.mockResolvedValue({
        transactions: [mockTx],
        server_knowledge: 12345,
      });

      const result = await tool.execute({
        budget_id: 'test-budget',
        transactions: [{
          account_id: 'acct-1',
          amount: -50000,
          date: '2024-01-15',
          import_id: 'imp-1',
        }],
      });

      expect(result.server_knowledge).toBe(12345);
    });

    it('passes cleared status to API', async () => {
      const mockTx = createMockTransaction({
        id: 'tx-1',
        import_id: 'imp-1',
        cleared: 'cleared',
      });

      client.createTransactions.mockResolvedValue({
        transactions: [mockTx],
        server_knowledge: 100,
      });

      await tool.execute({
        budget_id: 'test-budget',
        transactions: [{
          account_id: 'acct-1',
          amount: -50000,
          date: '2024-01-15',
          import_id: 'imp-1',
          cleared: 'cleared',
        }],
      });

      expect(client.createTransactions).toHaveBeenCalledWith(
        'test-budget',
        expect.arrayContaining([
          expect.objectContaining({ cleared: 'cleared' }),
        ])
      );
    });

    it('handles API errors gracefully', async () => {
      client.createTransactions.mockRejectedValue(new Error('API error'));

      await expect(tool.execute({
        budget_id: 'test-budget',
        transactions: [{
          account_id: 'acct-1',
          amount: -50000,
          date: '2024-01-15',
          import_id: 'imp-1',
        }],
      })).rejects.toThrow('import transactions failed');
    });

    it('provides helpful error for invalid account_id', async () => {
      client.createTransactions.mockRejectedValue(new Error('account_id not found'));

      await expect(tool.execute({
        budget_id: 'test-budget',
        transactions: [{
          account_id: 'invalid-acct',
          amount: -50000,
          date: '2024-01-15',
          import_id: 'imp-1',
        }],
      })).rejects.toThrow('Invalid account_id');
    });

    it('provides helpful error for invalid category_id', async () => {
      client.createTransactions.mockRejectedValue(new Error('category_id not found'));

      await expect(tool.execute({
        budget_id: 'test-budget',
        transactions: [{
          account_id: 'acct-1',
          category_id: 'invalid-cat',
          amount: -50000,
          date: '2024-01-15',
          import_id: 'imp-1',
        }],
      })).rejects.toThrow('Invalid category_id');
    });
  });
});
