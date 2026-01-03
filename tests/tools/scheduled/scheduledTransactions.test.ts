/**
 * Scheduled Transaction Tools Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GetScheduledTransactionsTool } from '../../../src/tools/scheduled/getScheduledTransactions.js';
import { GetScheduledTransactionTool } from '../../../src/tools/scheduled/getScheduledTransaction.js';
import { CreateScheduledTransactionTool } from '../../../src/tools/scheduled/createScheduledTransaction.js';
import { UpdateScheduledTransactionTool } from '../../../src/tools/scheduled/updateScheduledTransaction.js';
import { DeleteScheduledTransactionTool } from '../../../src/tools/scheduled/deleteScheduledTransaction.js';
import { createMockClient, type MockYNABClient } from '../../helpers/mockClient.js';
import { createMockScheduledTransaction } from '../../helpers/fixtures.js';

describe('GetScheduledTransactionsTool', () => {
  let client: MockYNABClient;
  let tool: GetScheduledTransactionsTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new GetScheduledTransactionsTool(client as any);
  });

  it('has correct name', () => {
    expect(tool.name).toBe('ynab_get_scheduled_transactions');
  });

  it('requires budget_id', async () => {
    await expect(tool.execute({})).rejects.toThrow();
  });

  it('returns list of scheduled transactions', async () => {
    client.getScheduledTransactions.mockResolvedValue({
      scheduled_transactions: [
        createMockScheduledTransaction({ id: 'st-1', frequency: 'monthly' }),
        createMockScheduledTransaction({ id: 'st-2', frequency: 'weekly' }),
      ],
      server_knowledge: 1,
    });

    const result = await tool.execute({ budget_id: 'test-budget' });

    expect(result.scheduled_transactions).toHaveLength(2);
  });

  it('handles API errors gracefully', async () => {
    client.getScheduledTransactions.mockRejectedValue(new Error('API error'));
    await expect(tool.execute({ budget_id: 'test-budget' })).rejects.toThrow();
  });
});

describe('GetScheduledTransactionTool', () => {
  let client: MockYNABClient;
  let tool: GetScheduledTransactionTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new GetScheduledTransactionTool(client as any);
  });

  it('has correct name', () => {
    expect(tool.name).toBe('ynab_get_scheduled_transaction');
  });

  it('requires budget_id and scheduled_transaction_id', async () => {
    await expect(tool.execute({})).rejects.toThrow();
    await expect(tool.execute({ budget_id: 'b' })).rejects.toThrow();
  });

  it('returns scheduled transaction details', async () => {
    const mockStx = createMockScheduledTransaction({ id: 'st-1', frequency: 'monthly' });
    client.getScheduledTransaction.mockResolvedValue(mockStx);

    const result = await tool.execute({
      budget_id: 'test-budget',
      scheduled_transaction_id: 'st-1',
    });

    // The tool returns with different structure than the mock
    expect(result.id).toBe('st-1');
    expect(result.frequency.type).toBe('monthly');
  });

  it('handles API errors gracefully', async () => {
    client.getScheduledTransaction.mockRejectedValue(new Error('Not found'));
    await expect(tool.execute({
      budget_id: 'test-budget',
      scheduled_transaction_id: 'st-1',
    })).rejects.toThrow();
  });
});

describe('CreateScheduledTransactionTool', () => {
  let client: MockYNABClient;
  let tool: CreateScheduledTransactionTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new CreateScheduledTransactionTool(client as any);
  });

  it('has correct name', () => {
    expect(tool.name).toBe('ynab_create_scheduled_transaction');
  });

  it('requires budget_id, account_id, date_first, and frequency', async () => {
    await expect(tool.execute({})).rejects.toThrow();
    await expect(tool.execute({ budget_id: 'b' })).rejects.toThrow();
    await expect(tool.execute({ budget_id: 'b', account_id: 'a' })).rejects.toThrow();
  });

  it('creates a scheduled transaction', async () => {
    const mockStx = createMockScheduledTransaction({ id: 'st-new', frequency: 'monthly' });
    client.createScheduledTransaction.mockResolvedValue({
      scheduled_transaction: mockStx,
    });

    const result = await tool.execute({
      budget_id: 'test-budget',
      account_id: 'test-account',
      date_first: '2024-02-01',
      frequency: 'monthly',
      amount: -50000,
    });

    expect(client.createScheduledTransaction).toHaveBeenCalled();
    expect(result.scheduled_transaction.id).toBe('st-new');
  });

  it('handles API errors gracefully', async () => {
    client.createScheduledTransaction.mockRejectedValue(new Error('API error'));
    await expect(tool.execute({
      budget_id: 'test-budget',
      account_id: 'test-account',
      date_first: '2024-02-01',
      frequency: 'monthly',
      amount: -50000,
    })).rejects.toThrow();
  });
});

describe('UpdateScheduledTransactionTool', () => {
  let client: MockYNABClient;
  let tool: UpdateScheduledTransactionTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new UpdateScheduledTransactionTool(client as any);
  });

  it('has correct name', () => {
    expect(tool.name).toBe('ynab_update_scheduled_transaction');
  });

  it('requires budget_id and scheduled_transaction_id', async () => {
    await expect(tool.execute({})).rejects.toThrow();
    await expect(tool.execute({ budget_id: 'b' })).rejects.toThrow();
  });

  it('updates a scheduled transaction', async () => {
    const mockStx = createMockScheduledTransaction({ id: 'st-1', amount: -75000 });
    client.updateScheduledTransaction.mockResolvedValue({
      scheduled_transaction: mockStx,
    });

    const result = await tool.execute({
      budget_id: 'test-budget',
      scheduled_transaction_id: 'st-1',
      amount: -75000,
    });

    expect(client.updateScheduledTransaction).toHaveBeenCalled();
    // The tool wraps amount in an object with milliunits and formatted
    expect(result.scheduled_transaction.amount.milliunits).toBe(-75000);
  });

  it('handles API errors gracefully', async () => {
    client.updateScheduledTransaction.mockRejectedValue(new Error('API error'));
    await expect(tool.execute({
      budget_id: 'test-budget',
      scheduled_transaction_id: 'st-1',
      amount: -75000,
    })).rejects.toThrow();
  });
});

describe('DeleteScheduledTransactionTool', () => {
  let client: MockYNABClient;
  let tool: DeleteScheduledTransactionTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new DeleteScheduledTransactionTool(client as any);
  });

  it('has correct name', () => {
    expect(tool.name).toBe('ynab_delete_scheduled_transaction');
  });

  it('requires budget_id and scheduled_transaction_id', async () => {
    await expect(tool.execute({})).rejects.toThrow();
    await expect(tool.execute({ budget_id: 'b' })).rejects.toThrow();
  });

  it('deletes a scheduled transaction', async () => {
    client.deleteScheduledTransaction.mockResolvedValue(undefined);

    const result = await tool.execute({
      budget_id: 'test-budget',
      scheduled_transaction_id: 'st-1',
    });

    expect(client.deleteScheduledTransaction).toHaveBeenCalledWith('test-budget', 'st-1');
    // The tool returns { deleted: true } on success
    expect(result.deleted).toBe(true);
  });

  it('handles API errors gracefully', async () => {
    client.deleteScheduledTransaction.mockRejectedValue(new Error('Not found'));
    await expect(tool.execute({
      budget_id: 'test-budget',
      scheduled_transaction_id: 'st-1',
    })).rejects.toThrow();
  });
});
