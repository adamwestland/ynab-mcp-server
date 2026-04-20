import { describe, it, expect, beforeEach } from 'vitest';
import { UpdateTransactionTool } from '../../../src/tools/transactions/updateTransaction.js';
import { YNABError } from '../../../src/client/ErrorHandler.js';
import { createMockClient, type MockYNABClient } from '../../helpers/mockClient.js';
import { createMockAccount, createMockCategory, createMockTransaction } from '../../helpers/fixtures.js';

describe('UpdateTransactionTool', () => {
  let client: MockYNABClient;
  let tool: UpdateTransactionTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new UpdateTransactionTool(client as any);
  });

  it('rejects reserved payee_name before hitting the API (issue #11)', async () => {
    await expect(tool.execute({
      budget_id: 'b1',
      transaction_id: 'tx-1',
      payee_name: 'Starting Balance',
    })).rejects.toThrow(/reserved by YNAB/i);
    expect(client.updateTransaction).not.toHaveBeenCalled();
  });

  it('enriches 400 with CC+RTA hint when input.account_id is supplied (#12)', async () => {
    client.updateTransactions.mockRejectedValue(
      new YNABError({ type: 'validation', message: 'Bad request', statusCode: 400 })
    );
    client.getAccount.mockResolvedValue(createMockAccount({ id: 'cc-1', type: 'creditCard', closed: false }));
    client.getCategory.mockResolvedValue({
      category: createMockCategory({ id: 'cat-rta', name: 'Inflow: Ready to Assign', category_group_name: 'Internal Master Category' }),
      server_knowledge: 1,
    });

    await expect(tool.execute({
      budget_id: 'b1',
      transaction_id: 'tx-1',
      account_id: 'cc-1',
      category_id: 'cat-rta',
    })).rejects.toThrow(/Inflow: Ready to Assign.*credit card/i);
  });

  it('falls back to fetching the transaction to resolve account_id for enrichment (#12)', async () => {
    client.updateTransactions.mockRejectedValue(
      new YNABError({ type: 'validation', message: 'Bad request', statusCode: 400 })
    );
    client.getTransaction.mockResolvedValue(createMockTransaction({ id: 'tx-1', account_id: 'cc-1' }));
    client.getAccount.mockResolvedValue(createMockAccount({ id: 'cc-1', type: 'creditCard', closed: false }));
    client.getCategory.mockResolvedValue({
      category: createMockCategory({ id: 'cat-rta', name: 'Inflow: Ready to Assign', category_group_name: 'Internal Master Category' }),
      server_knowledge: 1,
    });

    await expect(tool.execute({
      budget_id: 'b1',
      transaction_id: 'tx-1',
      category_id: 'cat-rta',
    })).rejects.toThrow(/Inflow: Ready to Assign.*credit card/i);
  });
});
