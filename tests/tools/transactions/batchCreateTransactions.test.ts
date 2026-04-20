import { describe, it, expect, beforeEach } from 'vitest';
import { BatchCreateTransactionsTool } from '../../../src/tools/transactions/batchCreateTransactions.js';
import { createMockClient, type MockYNABClient } from '../../helpers/mockClient.js';
import { createMockTransaction } from '../../helpers/fixtures.js';
import { YNABError } from '../../../src/client/ErrorHandler.js';

describe('BatchCreateTransactionsTool', () => {
  let client: MockYNABClient;
  let tool: BatchCreateTransactionsTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new BatchCreateTransactionsTool(client as any);
  });

  describe('metadata', () => {
    it('has correct name and description mentions batch/create', () => {
      expect(tool.name).toBe('ynab_batch_create_transactions');
      expect(tool.description.toLowerCase()).toContain('batch');
    });
  });

  describe('input validation', () => {
    it('requires budget_id and a non-empty transactions array', async () => {
      await expect(tool.execute({})).rejects.toThrow();
      await expect(tool.execute({ budget_id: 'b1', transactions: [] })).rejects.toThrow();
    });

    it('caps the batch at 100 transactions per YNAB API limit', async () => {
      const big = Array.from({ length: 101 }, () => ({
        account_id: 'a1', amount: -1000, date: '2024-01-01',
      }));
      await expect(tool.execute({ budget_id: 'b1', transactions: big })).rejects.toThrow();
    });

    it('rejects reserved payee_name on any transaction before any API call', async () => {
      await expect(tool.execute({
        budget_id: 'b1',
        transactions: [
          { account_id: 'a1', amount: -1000, date: '2024-01-01' },
          { account_id: 'a1', amount: -2000, date: '2024-01-02', payee_name: 'Reconciliation Balance Adjustment' },
        ],
      })).rejects.toThrow(/reserved by YNAB/i);
      expect(client.createTransactions).not.toHaveBeenCalled();
    });
  });

  describe('happy path (bulk POST)', () => {
    it('creates every transaction in a single bulk POST', async () => {
      client.createTransactions.mockResolvedValue({
        transactions: [
          createMockTransaction({ id: 'tx-1', import_id: 'bulk-1', amount: -1000 }),
          createMockTransaction({ id: 'tx-2', import_id: 'bulk-2', amount: -2000 }),
        ],
        server_knowledge: 42,
      });

      const result = await tool.execute({
        budget_id: 'b1',
        transactions: [
          { account_id: 'a1', amount: -1000, date: '2024-01-01', import_id: 'bulk-1' },
          { account_id: 'a1', amount: -2000, date: '2024-01-02', import_id: 'bulk-2' },
        ],
      });

      expect(client.createTransactions).toHaveBeenCalledTimes(1);
      expect(result.created.map(t => t.id)).toEqual(['tx-1', 'tx-2']);
      expect(result.failed).toHaveLength(0);
      expect(result.summary.total_submitted).toBe(2);
      expect(result.summary.created).toBe(2);
      expect(result.server_knowledge).toBe(42);
    });

    it('preserves cleared=reconciled + approved=true default without downgrading', async () => {
      client.createTransactions.mockImplementation(async (_b, txns) => ({
        transactions: txns.map((t: any, i: number) => createMockTransaction({
          id: `tx-${i}`,
          cleared: t.cleared,
          approved: t.approved,
        })),
        server_knowledge: 1,
      }));

      await tool.execute({
        budget_id: 'b1',
        transactions: [
          { account_id: 'a1', amount: -1000, date: '2024-01-01', cleared: 'reconciled' },
        ],
      });

      expect(client.createTransactions).toHaveBeenCalledWith(
        'b1',
        expect.arrayContaining([
          expect.objectContaining({ cleared: 'reconciled', approved: true }),
        ])
      );
    });

    it('surfaces duplicate_import_ids as failures with reason=duplicate_import_id', async () => {
      // Only one of two returned by YNAB — the other was a duplicate.
      client.createTransactions.mockResolvedValue({
        transactions: [createMockTransaction({ id: 'tx-1', import_id: 'bulk-1' })],
        server_knowledge: 1,
      });

      const result = await tool.execute({
        budget_id: 'b1',
        transactions: [
          { account_id: 'a1', amount: -1000, date: '2024-01-01', import_id: 'bulk-1' },
          { account_id: 'a1', amount: -2000, date: '2024-01-02', import_id: 'bulk-2' },
        ],
      });

      expect(result.created).toHaveLength(1);
      expect(result.duplicate_import_ids).toEqual(['bulk-2']);
      expect(result.summary.duplicates).toBe(1);
    });
  });

  describe('per-row fallback on bulk failure', () => {
    it('falls back to per-transaction POSTs when bulk POST 400s, reporting per-row status', async () => {
      let bulkCalls = 0;
      client.createTransactions.mockImplementation(async (_b, txns) => {
        bulkCalls += 1;
        if (bulkCalls === 1) {
          throw new YNABError({ type: 'validation', message: 'Bad request', statusCode: 400 });
        }
        // Per-txn fallback (array of 1 each). Fail the one with amount -2000.
        const t = txns[0] as any;
        if (t.amount === -2000) {
          throw new YNABError({ type: 'validation', message: 'category_id invalid', statusCode: 400 });
        }
        return {
          transactions: [createMockTransaction({ id: `tx-${t.amount}`, amount: t.amount })],
          server_knowledge: 1,
        };
      });

      const result = await tool.execute({
        budget_id: 'b1',
        transactions: [
          { account_id: 'a1', amount: -1000, date: '2024-01-01' },
          { account_id: 'a1', amount: -2000, date: '2024-01-02', category_id: 'bad' },
          { account_id: 'a1', amount: -3000, date: '2024-01-03' },
        ],
      });

      expect(result.created).toHaveLength(2);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]!.index).toBe(1);
      expect(result.failed[0]!.error).toMatch(/category_id/i);
      expect(result.summary.created).toBe(2);
      expect(result.summary.failed).toBe(1);
    });

    it('rethrows on non-4xx bulk failures rather than hammering with fallback', async () => {
      client.createTransactions.mockRejectedValue(
        new YNABError({ type: 'rate_limit', message: '429', statusCode: 429 })
      );
      await expect(tool.execute({
        budget_id: 'b1',
        transactions: [{ account_id: 'a1', amount: -1000, date: '2024-01-01' }],
      })).rejects.toThrow(/batch create transactions failed/i);
      expect(client.createTransactions).toHaveBeenCalledTimes(1);
    });

    it('does NOT trigger per-row fallback on 401 auth errors', async () => {
      client.createTransactions.mockRejectedValue(
        new YNABError({ type: 'auth', message: 'Unauthorized', statusCode: 401 })
      );
      await expect(tool.execute({
        budget_id: 'b1',
        transactions: [
          { account_id: 'a1', amount: -1000, date: '2024-01-01' },
          { account_id: 'a1', amount: -2000, date: '2024-01-02' },
        ],
      })).rejects.toThrow(/batch create transactions failed/i);
      // only the single bulk attempt; no 2 per-row retries
      expect(client.createTransactions).toHaveBeenCalledTimes(1);
    });

    it('rethrows when a rate-limit occurs mid-fallback (stop hammering)', async () => {
      let calls = 0;
      client.createTransactions.mockImplementation(async () => {
        calls += 1;
        if (calls === 1) {
          throw new YNABError({ type: 'validation', message: 'Bad request', statusCode: 400 });
        }
        if (calls === 3) {
          throw new YNABError({ type: 'rate_limit', message: '429', statusCode: 429 });
        }
        return {
          transactions: [createMockTransaction({ id: `tx-${calls}` })],
          server_knowledge: 1,
        };
      });

      await expect(tool.execute({
        budget_id: 'b1',
        transactions: [
          { account_id: 'a1', amount: -1000, date: '2024-01-01' },
          { account_id: 'a1', amount: -2000, date: '2024-01-02' },
          { account_id: 'a1', amount: -3000, date: '2024-01-03' },
        ],
      })).rejects.toThrow(/batch create transactions failed/i);
      // bulk + row 1 success + row 2 rate-limited (stop here, don't continue)
      expect(client.createTransactions).toHaveBeenCalledTimes(3);
    });
  });

  describe('index correlation', () => {
    it('correlates bulk happy-path rows back to submission order via import_id', async () => {
      // YNAB returns rows in reversed order — check we still map them correctly.
      client.createTransactions.mockResolvedValue({
        transactions: [
          createMockTransaction({ id: 'tx-2', import_id: 'bulk-2' }),
          createMockTransaction({ id: 'tx-1', import_id: 'bulk-1' }),
        ],
        server_knowledge: 1,
      });

      const result = await tool.execute({
        budget_id: 'b1',
        transactions: [
          { account_id: 'a1', amount: -1000, date: '2024-01-01', import_id: 'bulk-1' },
          { account_id: 'a1', amount: -2000, date: '2024-01-02', import_id: 'bulk-2' },
        ],
      });

      const byId = Object.fromEntries(result.created.map(r => [r.id, r.index]));
      expect(byId['tx-1']).toBe(0);
      expect(byId['tx-2']).toBe(1);
    });

    it('leaves index=null for bulk rows without import_id (response order is not guaranteed)', async () => {
      client.createTransactions.mockResolvedValue({
        transactions: [createMockTransaction({ id: 'tx-a' })],
        server_knowledge: 1,
      });
      const result = await tool.execute({
        budget_id: 'b1',
        transactions: [{ account_id: 'a1', amount: -1000, date: '2024-01-01' }],
      });
      expect(result.created[0]!.index).toBeNull();
    });
  });

  describe('server_knowledge nullability', () => {
    it('returns null server_knowledge when every fallback row fails', async () => {
      let calls = 0;
      client.createTransactions.mockImplementation(async () => {
        calls += 1;
        if (calls === 1) {
          throw new YNABError({ type: 'validation', message: 'Bad request', statusCode: 400 });
        }
        throw new YNABError({ type: 'validation', message: 'row bad', statusCode: 400 });
      });

      const result = await tool.execute({
        budget_id: 'b1',
        transactions: [
          { account_id: 'a1', amount: -1000, date: '2024-01-01' },
          { account_id: 'a1', amount: -2000, date: '2024-01-02' },
        ],
      });
      expect(result.server_knowledge).toBeNull();
      expect(result.failed).toHaveLength(2);
    });
  });
});
