/**
 * Transfer Tools Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LinkTransferTool } from '../../../src/tools/transfers/linkTransfer.js';
import { UnlinkTransferTool } from '../../../src/tools/transfers/unlinkTransfer.js';
import { createMockClient, type MockYNABClient } from '../../helpers/mockClient.js';
import { createMockAccount, createMockTransaction } from '../../helpers/fixtures.js';

describe('LinkTransferTool', () => {
  let client: MockYNABClient;
  let tool: LinkTransferTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new LinkTransferTool(client as any);
  });

  it('has correct name', () => {
    expect(tool.name).toBe('ynab_link_transfer');
  });

  it('requires budget_id, from_account_id, to_account_id, amount, and date', async () => {
    await expect(tool.execute({})).rejects.toThrow();
    await expect(tool.execute({ budget_id: 'b' })).rejects.toThrow();
    await expect(tool.execute({ budget_id: 'b', from_account_id: 'a1' })).rejects.toThrow();
    await expect(tool.execute({ budget_id: 'b', from_account_id: 'a1', to_account_id: 'a2' })).rejects.toThrow();
  });

  it('validates amount is positive', async () => {
    client.getAccounts.mockResolvedValue({
      accounts: [
        createMockAccount({ id: 'a1', name: 'Checking' }),
        createMockAccount({ id: 'a2', name: 'Savings', transfer_payee_id: 'tp-a2' }),
      ],
      server_knowledge: 1,
    });

    await expect(tool.execute({
      budget_id: 'test-budget',
      from_account_id: 'a1',
      to_account_id: 'a2',
      amount: -50000,
      date: '2024-01-15',
    })).rejects.toThrow('Transfer amount must be positive');
  });

  it('validates accounts are different', async () => {
    await expect(tool.execute({
      budget_id: 'test-budget',
      from_account_id: 'a1',
      to_account_id: 'a1',
      amount: 50000,
      date: '2024-01-15',
    })).rejects.toThrow('Cannot transfer between the same account');
  });

  it('validates destination account exists', async () => {
    client.getAccounts.mockResolvedValue({
      accounts: [
        createMockAccount({ id: 'a1', name: 'Checking' }),
      ],
      server_knowledge: 1,
    });

    await expect(tool.execute({
      budget_id: 'test-budget',
      from_account_id: 'a1',
      to_account_id: 'a2-nonexistent',
      amount: 50000,
      date: '2024-01-15',
    })).rejects.toThrow('Destination account with ID a2-nonexistent not found');
  });

  it('validates source account exists', async () => {
    client.getAccounts.mockResolvedValue({
      accounts: [
        createMockAccount({ id: 'a2', name: 'Savings', transfer_payee_id: 'tp-a2' }),
      ],
      server_knowledge: 1,
    });

    await expect(tool.execute({
      budget_id: 'test-budget',
      from_account_id: 'a1-nonexistent',
      to_account_id: 'a2',
      amount: 50000,
      date: '2024-01-15',
    })).rejects.toThrow('Source account with ID a1-nonexistent not found');
  });

  it('creates transfer between accounts', async () => {
    client.getAccounts.mockResolvedValue({
      accounts: [
        createMockAccount({ id: 'a1', name: 'Checking' }),
        createMockAccount({ id: 'a2', name: 'Savings', transfer_payee_id: 'tp-a2' }),
      ],
      server_knowledge: 1,
    });

    const mockTx = createMockTransaction({
      id: 'tx-transfer',
      account_id: 'a1',
      account_name: 'Checking',
      amount: -50000,
      date: '2024-01-15',
      payee_id: 'tp-a2',
      payee_name: 'Transfer : Savings',
      transfer_account_id: 'a2',
      transfer_transaction_id: 'tx-transfer-linked',
    });

    client.createTransaction.mockResolvedValue({
      transaction: mockTx,
      server_knowledge: 100,
    });

    const result = await tool.execute({
      budget_id: 'test-budget',
      from_account_id: 'a1',
      to_account_id: 'a2',
      amount: 50000,
      date: '2024-01-15',
    });

    expect(result.transfer_transaction.id).toBe('tx-transfer');
    expect(result.transfer_transaction.amount.milliunits).toBe(-50000);
    expect(result.transfer_transaction.transfer.account_id).toBe('a2');
    expect(result.server_knowledge).toBe(100);

    // Verify the API was called with negative amount
    expect(client.createTransaction).toHaveBeenCalledWith(
      'test-budget',
      expect.objectContaining({
        amount: -50000, // Negative for outflow
        payee_id: 'tp-a2',
      })
    );
  });

  it('includes memo when provided', async () => {
    client.getAccounts.mockResolvedValue({
      accounts: [
        createMockAccount({ id: 'a1', name: 'Checking' }),
        createMockAccount({ id: 'a2', name: 'Savings', transfer_payee_id: 'tp-a2' }),
      ],
      server_knowledge: 1,
    });

    const mockTx = createMockTransaction({
      id: 'tx-transfer',
      memo: 'Monthly savings',
      transfer_account_id: 'a2',
    });

    client.createTransaction.mockResolvedValue({
      transaction: mockTx,
      server_knowledge: 100,
    });

    await tool.execute({
      budget_id: 'test-budget',
      from_account_id: 'a1',
      to_account_id: 'a2',
      amount: 50000,
      date: '2024-01-15',
      memo: 'Monthly savings',
    });

    expect(client.createTransaction).toHaveBeenCalledWith(
      'test-budget',
      expect.objectContaining({
        memo: 'Monthly savings',
      })
    );
  });

  it('handles API errors gracefully', async () => {
    client.getAccounts.mockRejectedValue(new Error('API error'));

    await expect(tool.execute({
      budget_id: 'test-budget',
      from_account_id: 'a1',
      to_account_id: 'a2',
      amount: 50000,
      date: '2024-01-15',
    })).rejects.toThrow();
  });
});

describe('UnlinkTransferTool', () => {
  let client: MockYNABClient;
  let tool: UnlinkTransferTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new UnlinkTransferTool(client as any);
  });

  it('has correct name', () => {
    expect(tool.name).toBe('ynab_unlink_transfer');
  });

  it('requires budget_id and transaction_id', async () => {
    await expect(tool.execute({})).rejects.toThrow();
    await expect(tool.execute({ budget_id: 'b' })).rejects.toThrow();
  });

  it('validates transaction is a transfer', async () => {
    client.getTransaction.mockResolvedValue(createMockTransaction({
      id: 'tx-regular',
      transfer_account_id: null,
      transfer_transaction_id: null,
    }));

    await expect(tool.execute({
      budget_id: 'test-budget',
      transaction_id: 'tx-regular',
    })).rejects.toThrow('This transaction is not part of a transfer');
  });

  it('unlinks a transfer transaction', async () => {
    const transferTx = createMockTransaction({
      id: 'tx-1',
      transfer_account_id: 'a2',
      transfer_transaction_id: 'tx-2',
    });

    const unlinkedTx = createMockTransaction({
      id: 'tx-1',
      transfer_account_id: null,
      transfer_transaction_id: null,
      payee_id: null,
      payee_name: null,
    });

    client.getTransaction.mockResolvedValue(transferTx);
    client.updateTransaction.mockResolvedValue({
      transaction: unlinkedTx,
      server_knowledge: 100,
    });

    const result = await tool.execute({
      budget_id: 'test-budget',
      transaction_id: 'tx-1',
    });

    expect(result.transaction.id).toBe('tx-1');
    expect(result.transaction.transfer).toBeNull();
    expect(result.linked_transaction).toBeDefined();
    expect(result.linked_transaction?.id).toBe('tx-2');
    expect(result.linked_transaction?.was_also_unlinked).toBe(true);
    expect(result.server_knowledge).toBe(100);
  });

  it('sets new payee when provided', async () => {
    const transferTx = createMockTransaction({
      id: 'tx-1',
      transfer_account_id: 'a2',
      transfer_transaction_id: 'tx-2',
    });

    const unlinkedTx = createMockTransaction({
      id: 'tx-1',
      transfer_account_id: null,
      transfer_transaction_id: null,
      payee_name: 'New Payee',
    });

    client.getTransaction.mockResolvedValue(transferTx);
    client.updateTransaction.mockResolvedValue({
      transaction: unlinkedTx,
      server_knowledge: 100,
    });

    await tool.execute({
      budget_id: 'test-budget',
      transaction_id: 'tx-1',
      new_payee_name: 'New Payee',
    });

    expect(client.updateTransaction).toHaveBeenCalledWith(
      'test-budget',
      'tx-1',
      expect.objectContaining({
        payee_name: 'New Payee',
      })
    );
  });

  it('sets new category when provided', async () => {
    const transferTx = createMockTransaction({
      id: 'tx-1',
      transfer_account_id: 'a2',
      transfer_transaction_id: 'tx-2',
    });

    const unlinkedTx = createMockTransaction({
      id: 'tx-1',
      transfer_account_id: null,
      transfer_transaction_id: null,
      category_id: 'cat-new',
      category_name: 'Groceries',
    });

    client.getTransaction.mockResolvedValue(transferTx);
    client.updateTransaction.mockResolvedValue({
      transaction: unlinkedTx,
      server_knowledge: 100,
    });

    await tool.execute({
      budget_id: 'test-budget',
      transaction_id: 'tx-1',
      new_category_id: 'cat-new',
    });

    expect(client.updateTransaction).toHaveBeenCalledWith(
      'test-budget',
      'tx-1',
      expect.objectContaining({
        category_id: 'cat-new',
      })
    );
  });

  it('handles API errors gracefully', async () => {
    client.getTransaction.mockRejectedValue(new Error('Not found'));

    await expect(tool.execute({
      budget_id: 'test-budget',
      transaction_id: 'tx-1',
    })).rejects.toThrow();
  });
});
