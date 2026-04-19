import { describe, it, expect, beforeEach } from 'vitest';
import { UpdateTransactionTool } from '../../../src/tools/transactions/updateTransaction.js';
import { createMockClient, type MockYNABClient } from '../../helpers/mockClient.js';

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
});
