/**
 * GetTransactionsTool Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
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

  describe('needs_attention filter', () => {
    const accountId = 'acct-1';

    it('returns unapproved transactions', async () => {
      client.getTransactions
        .mockResolvedValueOnce({
          transactions: [
            createMockTransaction({ id: 'unapproved-1', account_id: accountId, approved: false, category_id: 'cat-1' }),
          ],
          server_knowledge: 1,
        })
        .mockResolvedValueOnce({
          transactions: [],
          server_knowledge: 1,
        });

      const result = await tool.execute({ budget_id: 'test-budget', type: 'needs_attention' });

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].id).toBe('unapproved-1');
    });

    it('returns uncategorized non-transfer transactions', async () => {
      client.getTransactions
        .mockResolvedValueOnce({
          transactions: [],
          server_knowledge: 1,
        })
        .mockResolvedValueOnce({
          transactions: [
            createMockTransaction({ id: 'uncat-1', account_id: accountId, category_id: null, transfer_account_id: null }),
          ],
          server_knowledge: 1,
        });

      const result = await tool.execute({ budget_id: 'test-budget', type: 'needs_attention' });

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].id).toBe('uncat-1');
    });

    it('excludes uncategorized transfers', async () => {
      client.getTransactions
        .mockResolvedValueOnce({
          transactions: [],
          server_knowledge: 1,
        })
        .mockResolvedValueOnce({
          transactions: [
            createMockTransaction({ id: 'transfer-1', account_id: accountId, category_id: null, transfer_account_id: 'acct-2' }),
            createMockTransaction({ id: 'real-uncat', account_id: accountId, category_id: null, transfer_account_id: null }),
          ],
          server_knowledge: 1,
        });

      const result = await tool.execute({ budget_id: 'test-budget', type: 'needs_attention' });

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].id).toBe('real-uncat');
    });

    it('deduplicates transactions that are both unapproved and uncategorized', async () => {
      const bothTx = createMockTransaction({ id: 'both-1', account_id: accountId, approved: false, category_id: null, transfer_account_id: null });

      client.getTransactions
        .mockResolvedValueOnce({
          transactions: [bothTx],
          server_knowledge: 1,
        })
        .mockResolvedValueOnce({
          transactions: [bothTx],
          server_knowledge: 1,
        });

      const result = await tool.execute({ budget_id: 'test-budget', type: 'needs_attention' });

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].id).toBe('both-1');
    });

    it('works with account_id filter', async () => {
      client.getAccountTransactions
        .mockResolvedValueOnce({
          transactions: [
            createMockTransaction({ id: 'unapproved-1', account_id: accountId, approved: false }),
          ],
          server_knowledge: 1,
        })
        .mockResolvedValueOnce({
          transactions: [],
          server_knowledge: 1,
        });

      const result = await tool.execute({ budget_id: 'test-budget', type: 'needs_attention', account_id: accountId });

      expect(client.getAccountTransactions).toHaveBeenCalledTimes(2);
      expect(result.transactions).toHaveLength(1);
    });

    it('works with compact mode', async () => {
      client.getTransactions
        .mockResolvedValueOnce({
          transactions: [
            createMockTransaction({ id: 'tx-1', approved: false, flag_color: 'red', import_id: 'imp-1' }),
          ],
          server_knowledge: 1,
        })
        .mockResolvedValueOnce({
          transactions: [],
          server_knowledge: 1,
        });

      const result = await tool.execute({ budget_id: 'test-budget', type: 'needs_attention', compact: true });
      const tx = result.transactions[0] as Record<string, unknown>;

      expect(tx).not.toHaveProperty('flag');
      expect(tx).not.toHaveProperty('import_info');
    });
  });

  describe('output_path', () => {
    let dir: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'ynab-mcp-transactions-'));
      client.getTransactions.mockResolvedValue({
        transactions: [
          createMockTransaction({ id: 'tx-old', date: '2024-01-05', amount: -10000, payee_name: 'Older', flag_color: 'yellow' }),
          createMockTransaction({ id: 'tx-new', date: '2024-02-10', amount: -25000, payee_name: 'Newer' }),
        ],
        server_knowledge: 4242,
      });
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('writes the full result to the file and returns a summary instead', async () => {
      const target = join(dir, 'snapshot.json');

      const result = await tool.execute({ budget_id: 'test-budget', since_date: '2024-01-01', output_path: target });

      expect(result).toMatchObject({
        path: target,
        transaction_count: 2,
        server_knowledge: 4242,
        has_more: false,
        date_range: { from: '2024-01-05', to: '2024-02-10' },
        fields: 'all',
      });
      expect((result as any).transactions).toBeUndefined();

      const text = readFileSync(target, 'utf-8');
      expect((result as any).bytes).toBe(Buffer.byteLength(text, 'utf-8'));
      const saved = JSON.parse(text);
      expect(saved.server_knowledge).toBe(4242);
      expect(saved.filtered_count).toBe(2);
      expect(saved.has_more).toBe(false);
      // newest first, same processed shape as the inline response
      expect(saved.transactions.map((t: any) => t.id)).toEqual(['tx-new', 'tx-old']);
      expect(saved.transactions[1].payee.name).toBe('Older');
      expect(saved.transactions[1].flag).toEqual({ color: 'yellow', name: null });
      expect(saved.transactions[1].amount).toEqual({ milliunits: -10000, formatted: '$-10.00' });
    });

    it('applies the fields projection to the file and reports it', async () => {
      const target = join(dir, 'projected.json');

      const result = await tool.execute({
        budget_id: 'test-budget',
        fields: ['id', 'category', 'flag'],
        output_path: target,
      });

      expect((result as any).fields).toEqual(['id', 'category', 'flag']);
      // no date in the projection → empty range rather than a crash
      expect((result as any).date_range).toEqual({ from: '', to: '' });
      const saved = JSON.parse(readFileSync(target, 'utf-8'));
      expect(Object.keys(saved.transactions[0]).sort()).toEqual(['category', 'flag', 'id']);
    });

    it('reports has_more when the limit was hit', async () => {
      const target = join(dir, 'limited.json');

      const result = await tool.execute({ budget_id: 'test-budget', limit: 1, output_path: target });

      expect((result as any).transaction_count).toBe(1);
      expect((result as any).has_more).toBe(true);
      expect(JSON.parse(readFileSync(target, 'utf-8')).transactions).toHaveLength(1);
    });

    it('creates missing parent directories', async () => {
      const target = join(dir, 'books', 'proposals', '2024-02-10.snapshot.json');

      await tool.execute({ budget_id: 'test-budget', output_path: target });

      expect(JSON.parse(readFileSync(target, 'utf-8')).transactions).toHaveLength(2);
    });

    it('returns inline data when output_path is omitted', async () => {
      const result = await tool.execute({ budget_id: 'test-budget' });
      expect((result as any).path).toBeUndefined();
      expect((result as any).transactions).toHaveLength(2);
    });
  });
});
