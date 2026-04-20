import { describe, it, expect, beforeEach } from 'vitest';
import { CreateSplitTransactionTool } from '../../../src/tools/transactions/createSplitTransaction.js';
import { YNABError } from '../../../src/client/ErrorHandler.js';
import { createMockClient, type MockYNABClient } from '../../helpers/mockClient.js';
import { createMockAccount, createMockCategory } from '../../helpers/fixtures.js';

describe('CreateSplitTransactionTool', () => {
  let client: MockYNABClient;
  let tool: CreateSplitTransactionTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new CreateSplitTransactionTool(client as any);
  });

  it('rejects reserved parent payee_name (issue #11)', async () => {
    await expect(tool.execute({
      budget_id: 'b1',
      account_id: 'a1',
      payee_name: 'Starting Balance',
      amount: -10000,
      date: '2024-01-15',
      subtransactions: [
        { amount: -5000, category_id: 'c1' },
        { amount: -5000, category_id: 'c2' },
      ],
    })).rejects.toThrow(/reserved by YNAB/i);
    expect(client.createTransactions).not.toHaveBeenCalled();
  });

  it('rejects reserved subtransaction payee_name (issue #11)', async () => {
    await expect(tool.execute({
      budget_id: 'b1',
      account_id: 'a1',
      amount: -10000,
      date: '2024-01-15',
      subtransactions: [
        { amount: -5000, category_id: 'c1' },
        { amount: -5000, category_id: 'c2', payee_name: 'Reconciliation Balance Adjustment' },
      ],
    })).rejects.toThrow(/reserved by YNAB/i);
    expect(client.createTransactions).not.toHaveBeenCalled();
  });

  it('enriches 400 with CC+RTA hint when a subtransaction targets RTA on a CC (#12)', async () => {
    client.createTransactions.mockRejectedValue(
      new YNABError({ type: 'validation', message: 'Bad request', statusCode: 400 })
    );
    client.getAccount.mockResolvedValue(createMockAccount({ id: 'cc-1', type: 'creditCard', closed: false }));
    client.getCategory.mockResolvedValue({
      category: createMockCategory({ id: 'cat-rta', name: 'Inflow: Ready to Assign', category_group_name: 'Internal Master Category' }),
      server_knowledge: 1,
    });

    await expect(tool.execute({
      budget_id: 'b1',
      account_id: 'cc-1',
      amount: -10000,
      date: '2024-01-15',
      subtransactions: [
        { amount: -5000, category_id: 'cat-rta' },
        { amount: -5000, category_id: 'cat-food' },
      ],
    })).rejects.toThrow(/Inflow: Ready to Assign.*credit card/i);
  });
});
