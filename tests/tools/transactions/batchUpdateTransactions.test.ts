import { describe, it, expect, beforeEach } from 'vitest';
import { BatchUpdateTransactionsTool } from '../../../src/tools/transactions/batchUpdateTransactions.js';
import { createMockClient, type MockYNABClient } from '../../helpers/mockClient.js';

describe('BatchUpdateTransactionsTool', () => {
  let client: MockYNABClient;
  let tool: BatchUpdateTransactionsTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new BatchUpdateTransactionsTool(client as any);
  });

  it('rejects reserved payee_name on any transaction before hitting the API (issue #11)', async () => {
    await expect(tool.execute({
      budget_id: 'b1',
      transactions: [
        { transaction_id: 'tx-1', memo: 'ok' },
        { transaction_id: 'tx-2', payee_name: 'Manual Balance Adjustment' },
      ],
    })).rejects.toThrow(/reserved by YNAB/i);
    expect(client.updateTransactions).not.toHaveBeenCalled();
  });
});
