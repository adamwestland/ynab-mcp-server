/**
 * CreateTransactionTool Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CreateTransactionTool } from '../../../src/tools/transactions/createTransaction.js';
import { createMockClient, type MockYNABClient } from '../../helpers/mockClient.js';
import { createMockTransaction, createMockPayee } from '../../helpers/fixtures.js';

describe('CreateTransactionTool', () => {
  let client: MockYNABClient;
  let tool: CreateTransactionTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new CreateTransactionTool(client as any);
  });

  describe('metadata', () => {
    it('has correct name', () => {
      expect(tool.name).toBe('ynab_create_transaction');
    });

    it('has description mentioning milliunits', () => {
      expect(tool.description).toContain('milliunits');
    });
  });

  describe('execute', () => {
    it('requires budget_id, account_id, amount, and date', async () => {
      await expect(tool.execute({})).rejects.toThrow();
      await expect(tool.execute({ budget_id: 'b' })).rejects.toThrow();
      await expect(tool.execute({ budget_id: 'b', account_id: 'a' })).rejects.toThrow();
    });

    it('validates date format', async () => {
      await expect(tool.execute({
        budget_id: 'b',
        account_id: 'a',
        amount: -50000,
        date: 'invalid-date',
      })).rejects.toThrow();
    });

    it('creates transaction with minimal fields', async () => {
      const mockTx = createMockTransaction({
        id: 'tx-new',
        amount: -50000,
        date: '2024-01-15',
      });
      client.createTransactions.mockResolvedValue({
        transactions: [mockTx],
        server_knowledge: 1,
      });

      const result = await tool.execute({
        budget_id: 'test-budget',
        account_id: 'test-account',
        amount: -50000,
        date: '2024-01-15',
      });

      expect(result.transaction.id).toBe('tx-new');
      expect(result.transaction.amount.milliunits).toBe(-50000);
      expect(result.transaction.amount.formatted).toBe('$-50.00');
      expect(client.createTransactions).toHaveBeenCalledWith('test-budget', expect.any(Array));
    });

    it('creates transaction with all fields', async () => {
      const mockTx = createMockTransaction({
        id: 'tx-full',
        amount: -75000,
        date: '2024-02-20',
        memo: 'Test memo',
        cleared: 'cleared',
        approved: true,
        flag_color: 'red',
      });
      client.createTransactions.mockResolvedValue({
        transactions: [mockTx],
        server_knowledge: 1,
      });

      const result = await tool.execute({
        budget_id: 'test-budget',
        account_id: 'test-account',
        category_id: 'cat-1',
        payee_id: 'payee-1',
        amount: -75000,
        date: '2024-02-20',
        memo: 'Test memo',
        cleared: 'cleared',
        approved: true,
        flag_color: 'red',
      });

      expect(result.transaction.memo).toBe('Test memo');
      expect(result.transaction.cleared).toBe('cleared');
      expect(result.transaction.approved).toBe(true);
    });

    it('creates payee when payee_name is provided and does not exist', async () => {
      client.getPayees.mockResolvedValue({
        payees: [],
        server_knowledge: 1,
      });
      client.post.mockResolvedValue({
        payee: { id: 'new-payee-id', name: 'New Store' },
      });
      const mockTx = createMockTransaction({
        id: 'tx-1',
        payee_id: 'new-payee-id',
        payee_name: 'New Store',
      });
      client.createTransactions.mockResolvedValue({
        transactions: [mockTx],
        server_knowledge: 1,
      });

      const result = await tool.execute({
        budget_id: 'test-budget',
        account_id: 'test-account',
        payee_name: 'New Store',
        amount: -50000,
        date: '2024-01-15',
      });

      expect(result.created_payee).not.toBeNull();
      expect(result.created_payee?.name).toBe('New Store');
      expect(client.post).toHaveBeenCalledWith(
        '/budgets/test-budget/payees',
        expect.objectContaining({ payee: { name: 'New Store' } })
      );
    });

    it('reuses existing payee when payee_name matches', async () => {
      client.getPayees.mockResolvedValue({
        payees: [createMockPayee({ id: 'existing-payee', name: 'Existing Store' })],
        server_knowledge: 1,
      });
      const mockTx = createMockTransaction({
        id: 'tx-1',
        payee_id: 'existing-payee',
        payee_name: 'Existing Store',
      });
      client.createTransactions.mockResolvedValue({
        transactions: [mockTx],
        server_knowledge: 1,
      });

      const result = await tool.execute({
        budget_id: 'test-budget',
        account_id: 'test-account',
        payee_name: 'Existing Store',
        amount: -50000,
        date: '2024-01-15',
      });

      expect(result.created_payee).toBeNull();
      expect(client.post).not.toHaveBeenCalled();
    });

    it('validates import_id length', async () => {
      await expect(tool.execute({
        budget_id: 'test-budget',
        account_id: 'test-account',
        amount: -50000,
        date: '2024-01-15',
        import_id: 'a'.repeat(37), // 37 chars, exceeds limit
      })).rejects.toThrow('Import ID must be 36 characters or less');
    });

    it('includes import_id in transaction', async () => {
      const mockTx = createMockTransaction({
        id: 'tx-1',
        import_id: 'YNAB:-50000:Store:2024-01-15',
      });
      client.createTransactions.mockResolvedValue({
        transactions: [mockTx],
        server_knowledge: 1,
      });

      const result = await tool.execute({
        budget_id: 'test-budget',
        account_id: 'test-account',
        amount: -50000,
        date: '2024-01-15',
        import_id: 'YNAB:-50000:Store:2024-01-15',
      });

      expect(result.transaction.import_id).toBe('YNAB:-50000:Store:2024-01-15');
    });

    it('identifies transfer transactions', async () => {
      const mockTx = createMockTransaction({
        id: 'tx-1',
        category_id: null,
        category_name: null,
        transfer_account_id: 'acct-2',
      });
      client.createTransactions.mockResolvedValue({
        transactions: [mockTx],
        server_knowledge: 1,
      });

      const result = await tool.execute({
        budget_id: 'test-budget',
        account_id: 'test-account',
        amount: -50000,
        date: '2024-01-15',
        category_id: null,
      });

      expect(result.transaction.is_transfer).toBe(true);
    });

    it('returns server_knowledge for delta sync', async () => {
      const mockTx = createMockTransaction({ id: 'tx-1' });
      client.createTransactions.mockResolvedValue({
        transactions: [mockTx],
        server_knowledge: 12345,
      });

      const result = await tool.execute({
        budget_id: 'test-budget',
        account_id: 'test-account',
        amount: -50000,
        date: '2024-01-15',
      });

      expect(result.server_knowledge).toBe(12345);
    });

    it('handles API errors gracefully', async () => {
      client.createTransactions.mockRejectedValue(new Error('API error'));

      await expect(tool.execute({
        budget_id: 'test-budget',
        account_id: 'test-account',
        amount: -50000,
        date: '2024-01-15',
      })).rejects.toThrow('create transaction failed');
    });

    it('handles empty transaction response', async () => {
      client.createTransactions.mockResolvedValue({
        transactions: [],
        server_knowledge: 1,
      });

      await expect(tool.execute({
        budget_id: 'test-budget',
        account_id: 'test-account',
        amount: -50000,
        date: '2024-01-15',
      })).rejects.toThrow('No transaction returned');
    });
  });
});
