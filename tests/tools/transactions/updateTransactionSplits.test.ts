/**
 * UpdateTransactionSplitsTool Unit Tests
 *
 * YNAB API limitation: the PATCH endpoint silently ignores the `subtransactions`
 * array on existing transactions. Subtransactions are immutable once created.
 *
 * Workaround: when modifying subtransactions on an existing split, the tool
 * deletes the old transaction and recreates it with the new subtransaction
 * categories/memos/amounts. This is the only reliable way to change subtxn
 * fields via the public YNAB API.
 *
 * Creating a NEW split from a regular transaction still uses PATCH (works fine).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UpdateTransactionSplitsTool } from '../../../src/tools/transactions/updateTransactionSplits.js';
import { createMockClient, type MockYNABClient } from '../../helpers/mockClient.js';
import { createMockTransaction, createMockSplitTransaction } from '../../helpers/fixtures.js';

describe('UpdateTransactionSplitsTool', () => {
  let client: MockYNABClient;
  let tool: UpdateTransactionSplitsTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new UpdateTransactionSplitsTool(client as any);
  });

  describe('metadata', () => {
    it('has correct name', () => {
      expect(tool.name).toBe('ynab_update_transaction_splits');
    });
  });

  describe('modifying existing split: delete + recreate', () => {
    it('deletes old transaction and creates new one when updating subtxns on existing split', async () => {
      const splitTxn = createMockSplitTransaction(2, {
        id: 'split-1',
        account_id: 'acct-1',
        date: '2025-01-18',
        amount: -100000,
        payee_id: 'payee-1',
        payee_name: 'Apple',
        memo: 'Original memo',
        cleared: 'cleared',
        approved: true,
      });
      client.getTransactions.mockResolvedValue({
        transactions: [splitTxn],
        server_knowledge: 1,
      });
      client.delete.mockResolvedValue({
        transaction: { id: 'split-1', deleted: true },
        server_knowledge: 2,
      });
      const recreatedTxn = createMockSplitTransaction(2, {
        id: 'new-split-1',
        account_id: 'acct-1',
        amount: -100000,
      });
      client.createTransactions.mockResolvedValue({
        transactions: [recreatedTxn],
        server_knowledge: 3,
      });

      await tool.execute({
        budget_id: 'b1',
        transaction_id: 'split-1',
        subtransactions: [
          { subtransaction_id: splitTxn.subtransactions![0]!.id, amount: -60000, category_id: 'cat-movies' },
          { subtransaction_id: splitTxn.subtransactions![1]!.id, amount: -40000, category_id: 'cat-software' },
        ],
      });

      // Should delete the old transaction
      expect(client.delete).toHaveBeenCalledWith('/budgets/b1/transactions/split-1');

      // Should create a new one with the new subtransaction categories
      expect(client.createTransactions).toHaveBeenCalledTimes(1);
      const createCall = client.createTransactions.mock.calls[0]!;
      const createdTxns = createCall[1] as Array<{
        account_id: string;
        date: string;
        amount: number;
        subtransactions: Array<{ amount: number; category_id: string }>;
      }>;
      expect(createdTxns[0]!.account_id).toBe('acct-1');
      expect(createdTxns[0]!.date).toBe('2025-01-18');
      expect(createdTxns[0]!.amount).toBe(-100000);
      expect(createdTxns[0]!.subtransactions).toHaveLength(2);
      expect(createdTxns[0]!.subtransactions[0]!.category_id).toBe('cat-movies');
      expect(createdTxns[0]!.subtransactions[1]!.category_id).toBe('cat-software');

      // Should NOT use updateTransaction or updateTransactions
      expect(client.updateTransaction).not.toHaveBeenCalled();
      expect(client.updateTransactions).not.toHaveBeenCalled();
    });

    it('preserves original transaction properties (date, payee, memo, cleared, approved, flag) on recreate', async () => {
      const splitTxn = createMockSplitTransaction(2, {
        id: 'split-props',
        account_id: 'acct-1',
        date: '2024-12-22',
        amount: -100000,
        payee_id: 'payee-apple',
        payee_name: 'Apple',
        memo: 'Multi-item purchase',
        cleared: 'reconciled',
        approved: true,
        flag_color: 'blue',
        import_id: 'YNAB:-100000:2024-12-22:1',
      });
      client.getTransactions.mockResolvedValue({
        transactions: [splitTxn],
        server_knowledge: 1,
      });
      client.delete.mockResolvedValue({ transaction: { id: 'split-props', deleted: true }, server_knowledge: 2 });
      client.createTransactions.mockResolvedValue({
        transactions: [createMockSplitTransaction(2, { id: 'new-id' })],
        server_knowledge: 3,
      });

      await tool.execute({
        budget_id: 'b1',
        transaction_id: 'split-props',
        subtransactions: [
          { amount: -60000, category_id: 'cat-a' },
          { amount: -40000, category_id: 'cat-b' },
        ],
      });

      const createCall = client.createTransactions.mock.calls[0]!;
      const created = createCall[1][0] as Record<string, unknown>;
      expect(created.account_id).toBe('acct-1');
      expect(created.date).toBe('2024-12-22');
      expect(created.payee_id).toBe('payee-apple');
      expect(created.memo).toBe('Multi-item purchase');
      expect(created.cleared).toBe('reconciled');
      expect(created.approved).toBe(true);
      expect(created.flag_color).toBe('blue');
    });

    it('allows overriding main transaction fields during recreate', async () => {
      const splitTxn = createMockSplitTransaction(2, {
        id: 'split-override',
        account_id: 'acct-1',
        date: '2025-01-18',
        amount: -100000,
        memo: 'Old memo',
      });
      client.getTransactions.mockResolvedValue({
        transactions: [splitTxn],
        server_knowledge: 1,
      });
      client.delete.mockResolvedValue({ transaction: { id: 'split-override', deleted: true }, server_knowledge: 2 });
      client.createTransactions.mockResolvedValue({
        transactions: [createMockSplitTransaction(2, { id: 'new-id' })],
        server_knowledge: 3,
      });

      await tool.execute({
        budget_id: 'b1',
        transaction_id: 'split-override',
        memo: 'New memo',
        subtransactions: [
          { amount: -60000, category_id: 'cat-a' },
          { amount: -40000, category_id: 'cat-b' },
        ],
      });

      const created = client.createTransactions.mock.calls[0]![1][0] as Record<string, unknown>;
      expect(created.memo).toBe('New memo');
    });
  });

  describe('creating new split from regular txn: uses PATCH', () => {
    it('uses updateTransaction when converting regular txn to split (no existing subtxns)', async () => {
      const regularTxn = createMockTransaction({ id: 'reg-1', amount: -100000, subtransactions: [] });
      client.getTransactions.mockResolvedValue({
        transactions: [regularTxn],
        server_knowledge: 1,
      });
      client.updateTransaction.mockResolvedValue({
        transaction: createMockSplitTransaction(2, { id: 'reg-1', amount: -100000 }),
      });

      await tool.execute({
        budget_id: 'b1',
        transaction_id: 'reg-1',
        subtransactions: [
          { amount: -60000, category_id: 'cat-a' },
          { amount: -40000, category_id: 'cat-b' },
        ],
      });

      expect(client.updateTransaction).toHaveBeenCalledTimes(1);
      expect(client.delete).not.toHaveBeenCalled();
      expect(client.createTransactions).not.toHaveBeenCalled();
    });
  });

  describe('convert to regular: uses PATCH', () => {
    it('uses updateTransaction when converting split back to regular', async () => {
      const splitTxn = createMockSplitTransaction(2, { id: 'split-2' });
      client.getTransactions.mockResolvedValue({
        transactions: [splitTxn],
        server_knowledge: 1,
      });
      client.updateTransaction.mockResolvedValue({
        transaction: createMockTransaction({ id: 'split-2', subtransactions: [] }),
      });

      await tool.execute({
        budget_id: 'b1',
        transaction_id: 'split-2',
        convert_to_regular: true,
        category_id: 'cat-main',
      });

      expect(client.updateTransaction).toHaveBeenCalledTimes(1);
      expect(client.updateTransaction).toHaveBeenCalledWith(
        'b1',
        'split-2',
        expect.objectContaining({
          category_id: 'cat-main',
          subtransactions: [],
        })
      );
      expect(client.delete).not.toHaveBeenCalled();
    });
  });

  describe('input validation', () => {
    it('throws if transaction not found', async () => {
      client.getTransactions.mockResolvedValue({ transactions: [], server_knowledge: 1 });
      await expect(tool.execute({
        budget_id: 'b1',
        transaction_id: 'nope',
        subtransactions: [{ amount: -1000, category_id: 'c' }],
      })).rejects.toThrow();
    });

    it('throws if subtransaction amounts do not sum to total', async () => {
      const splitTxn = createMockSplitTransaction(2, { id: 'split-4', amount: -100000 });
      client.getTransactions.mockResolvedValue({
        transactions: [splitTxn],
        server_knowledge: 1,
      });

      await expect(tool.execute({
        budget_id: 'b1',
        transaction_id: 'split-4',
        subtransactions: [
          { amount: -40000, category_id: 'c1' },
          { amount: -50000, category_id: 'c2' },
        ],
        total_amount: -100000,
      })).rejects.toThrow(/does not equal target total/);
    });

    it('throws when convert_to_regular is used without category_id', async () => {
      const splitTxn = createMockSplitTransaction(2, { id: 'split-5' });
      client.getTransactions.mockResolvedValue({
        transactions: [splitTxn],
        server_knowledge: 1,
      });

      await expect(tool.execute({
        budget_id: 'b1',
        transaction_id: 'split-5',
        convert_to_regular: true,
      })).rejects.toThrow(/category_id is required/);
    });
  });
});
