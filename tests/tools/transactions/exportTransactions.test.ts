/**
 * ExportTransactionsTool Unit Tests (output_path handling)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ExportTransactionsTool } from '../../../src/tools/transactions/exportTransactions.js';
import { createMockClient, type MockYNABClient } from '../../helpers/mockClient.js';
import { createMockTransaction } from '../../helpers/fixtures.js';

describe('ExportTransactionsTool', () => {
  let client: MockYNABClient;
  let tool: ExportTransactionsTool;
  let dir: string;
  const savedEnv = process.env.YNAB_OUTPUT_DIR;

  beforeEach(() => {
    client = createMockClient();
    tool = new ExportTransactionsTool(client as any);
    dir = mkdtempSync(join(tmpdir(), 'ynab-mcp-export-'));
    process.env.YNAB_OUTPUT_DIR = dir;
    client.getTransactions.mockResolvedValue({
      transactions: [
        createMockTransaction({ id: 'tx-2', date: '2024-02-01', amount: -20000, payee_name: 'B, Inc' }),
        createMockTransaction({ id: 'tx-1', date: '2024-01-01', amount: -10000, payee_name: 'A' }),
      ],
      server_knowledge: 1,
    });
  });

  afterEach(() => {
    if (savedEnv === undefined) delete process.env.YNAB_OUTPUT_DIR;
    else process.env.YNAB_OUTPUT_DIR = savedEnv;
    rmSync(dir, { recursive: true, force: true });
  });

  it('has correct name', () => {
    expect(tool.name).toBe('ynab_export_transactions_csv');
  });

  it('returns the CSV string when output_path is omitted', async () => {
    const csv = await tool.execute({ budget_id: 'b', account_id: '', all_accounts: true });
    expect(typeof csv).toBe('string');
    expect((csv as string).split('\n')[0]).toMatch(/^date,amount,payee_name/);
    expect(csv).toContain('"B, Inc"');
  });

  it('writes the CSV to an allowed output_path and returns a summary with the absolute path', async () => {
    const target = join(dir, 'exports', 'all.csv');

    const result = await tool.execute({ budget_id: 'b', account_id: '', all_accounts: true, output_path: target });

    expect(result).toEqual({
      path: target,
      count: 2,
      date_range: { from: '2024-01-01', to: '2024-02-01' },
      sum: '-30.00',
    });
    const lines = readFileSync(target, 'utf-8').split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatch(/^2024-01-01,-10.00,A,/);
  });

  it('rejects an output_path outside the allowed directories before calling the API', async () => {
    const target = join(dir, '..', 'escape.csv');

    await expect(tool.execute({ budget_id: 'b', account_id: '', all_accounts: true, output_path: target }))
      .rejects.toThrow(/outside the allowed output directories/);
    expect(client.getTransactions).not.toHaveBeenCalled();
    expect(existsSync(target)).toBe(false);
  });
});
