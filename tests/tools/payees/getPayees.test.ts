/**
 * Payee Tools Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GetPayeesTool } from '../../../src/tools/payees/getPayees.js';
import { GetPayeeTool } from '../../../src/tools/payees/getPayee.js';
import { CreatePayeeTool } from '../../../src/tools/payees/createPayee.js';
import { createMockClient, type MockYNABClient } from '../../helpers/mockClient.js';
import { createMockPayee, createMockTransferPayee } from '../../helpers/fixtures.js';

describe('GetPayeesTool', () => {
  let client: MockYNABClient;
  let tool: GetPayeesTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new GetPayeesTool(client as any);
  });

  it('has correct name', () => {
    expect(tool.name).toBe('ynab_get_payees');
  });

  it('requires budget_id', async () => {
    await expect(tool.execute({})).rejects.toThrow();
  });

  it('returns list of payees', async () => {
    client.getPayees.mockResolvedValue({
      payees: [
        createMockPayee({ id: 'p1', name: 'Amazon' }),
        createMockPayee({ id: 'p2', name: 'Grocery Store' }),
      ],
      server_knowledge: 1,
    });

    const result = await tool.execute({ budget_id: 'test-budget' });

    expect(result.payees).toHaveLength(2);
    expect(result.payees[0].name).toBe('Amazon');
  });

  it('identifies transfer payees', async () => {
    client.getPayees.mockResolvedValue({
      payees: [
        createMockPayee({ id: 'p1', name: 'Regular Payee' }),
        createMockTransferPayee('acct-1', 'Savings'),
      ],
      server_knowledge: 1,
    });

    const result = await tool.execute({ budget_id: 'test-budget' });

    expect(result.payees.some((p: { transfer_account_id: string | null }) => p.transfer_account_id !== null)).toBe(true);
  });

  it('handles API errors gracefully', async () => {
    client.getPayees.mockRejectedValue(new Error('API error'));
    await expect(tool.execute({ budget_id: 'test-budget' })).rejects.toThrow();
  });
});

describe('GetPayeeTool', () => {
  let client: MockYNABClient;
  let tool: GetPayeeTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new GetPayeeTool(client as any);
  });

  it('has correct name', () => {
    expect(tool.name).toBe('ynab_get_payee');
  });

  it('requires budget_id and payee_id', async () => {
    await expect(tool.execute({})).rejects.toThrow();
    await expect(tool.execute({ budget_id: 'b' })).rejects.toThrow();
  });

  it('returns payee details', async () => {
    client.getPayee.mockResolvedValue({
      payee: createMockPayee({ id: 'p1', name: 'Test Payee' }),
    });

    const result = await tool.execute({
      budget_id: 'test-budget',
      payee_id: 'p1',
    });

    expect(result.payee.name).toBe('Test Payee');
  });

  it('handles API errors gracefully', async () => {
    client.getPayee.mockRejectedValue(new Error('Not found'));
    await expect(tool.execute({
      budget_id: 'test-budget',
      payee_id: 'p1',
    })).rejects.toThrow();
  });
});

describe('CreatePayeeTool', () => {
  let client: MockYNABClient;
  let tool: CreatePayeeTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new CreatePayeeTool(client as any);
  });

  it('has correct name', () => {
    expect(tool.name).toBe('ynab_create_payee');
  });

  it('requires budget_id and name', async () => {
    await expect(tool.execute({})).rejects.toThrow();
    await expect(tool.execute({ budget_id: 'b' })).rejects.toThrow();
  });

  it('creates a new payee', async () => {
    client.createPayee.mockResolvedValue({
      payee: createMockPayee({ id: 'new-payee', name: 'New Store' }),
    });

    const result = await tool.execute({
      budget_id: 'test-budget',
      name: 'New Store',
    });

    expect(client.createPayee).toHaveBeenCalledWith('test-budget', { name: 'New Store' });
    expect(result.payee.name).toBe('New Store');
  });

  it('handles API errors gracefully', async () => {
    client.createPayee.mockRejectedValue(new Error('API error'));
    await expect(tool.execute({
      budget_id: 'test-budget',
      name: 'New Store',
    })).rejects.toThrow();
  });
});
