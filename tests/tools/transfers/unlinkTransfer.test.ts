import { describe, it, expect, beforeEach } from 'vitest';
import { UnlinkTransferTool } from '../../../src/tools/transfers/unlinkTransfer.js';
import { createMockClient, type MockYNABClient } from '../../helpers/mockClient.js';

describe('UnlinkTransferTool', () => {
  let client: MockYNABClient;
  let tool: UnlinkTransferTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new UnlinkTransferTool(client as any);
  });

  it('rejects reserved new_payee_name before hitting the API (issue #11)', async () => {
    await expect(tool.execute({
      budget_id: 'b1',
      transaction_id: 'tx-1',
      new_payee_name: 'Manual Balance Adjustment',
    })).rejects.toThrow(/reserved by YNAB/i);
    expect(client.getTransaction).not.toHaveBeenCalled();
  });
});
