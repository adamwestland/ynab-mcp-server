/**
 * GetAccountsTool Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GetAccountsTool } from '../../../src/tools/accounts/getAccounts.js';
import { createMockClient, type MockYNABClient } from '../../helpers/mockClient.js';
import { createMockAccount } from '../../helpers/fixtures.js';

describe('GetAccountsTool', () => {
  let client: MockYNABClient;
  let tool: GetAccountsTool;

  beforeEach(() => {
    client = createMockClient();
    tool = new GetAccountsTool(client as any);
  });

  describe('metadata', () => {
    it('has correct name', () => {
      expect(tool.name).toBe('ynab_get_accounts');
    });

    it('has description mentioning transfer_payee_id', () => {
      expect(tool.description).toContain('transfer_payee_id');
    });
  });

  describe('execute', () => {
    it('requires budget_id', async () => {
      await expect(tool.execute({})).rejects.toThrow();
    });

    it('returns empty list when no accounts exist', async () => {
      client.getAccounts.mockResolvedValue({
        accounts: [],
        server_knowledge: 1,
      });

      const result = await tool.execute({ budget_id: 'test-budget' });

      expect(result.accounts).toEqual([]);
      expect(result.total_count).toBe(0);
      expect(result.filtered_count).toBe(0);
    });

    it('returns accounts with formatted balances', async () => {
      client.getAccounts.mockResolvedValue({
        accounts: [createMockAccount({
          id: 'acct-1',
          name: 'Checking',
          balance: 150000,
          cleared_balance: 100000,
          uncleared_balance: 50000,
        })],
        server_knowledge: 1,
      });

      const result = await tool.execute({ budget_id: 'test-budget' });

      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0].id).toBe('acct-1');
      expect(result.accounts[0].balance.current).toBe(150000);
      expect(result.accounts[0].balance.formatted_current).toBe('$150.00');
      expect(result.accounts[0].balance.formatted_cleared).toBe('$100.00');
      expect(result.accounts[0].balance.formatted_uncleared).toBe('$50.00');
    });

    it('filters by account_type', async () => {
      client.getAccounts.mockResolvedValue({
        accounts: [
          createMockAccount({ id: '1', type: 'checking' }),
          createMockAccount({ id: '2', type: 'savings' }),
          createMockAccount({ id: '3', type: 'checking' }),
        ],
        server_knowledge: 1,
      });

      const result = await tool.execute({
        budget_id: 'test-budget',
        account_type: 'checking',
      });

      expect(result.filtered_count).toBe(2);
      expect(result.total_count).toBe(3);
      expect(result.accounts.every(a => a.type === 'checking')).toBe(true);
    });

    it('filters by on_budget_only', async () => {
      client.getAccounts.mockResolvedValue({
        accounts: [
          createMockAccount({ id: '1', on_budget: true }),
          createMockAccount({ id: '2', on_budget: false }),
          createMockAccount({ id: '3', on_budget: true }),
        ],
        server_knowledge: 1,
      });

      const result = await tool.execute({
        budget_id: 'test-budget',
        on_budget_only: true,
      });

      expect(result.filtered_count).toBe(2);
      expect(result.accounts.every(a => a.on_budget)).toBe(true);
    });

    it('excludes closed accounts by default', async () => {
      client.getAccounts.mockResolvedValue({
        accounts: [
          createMockAccount({ id: '1', closed: false }),
          createMockAccount({ id: '2', closed: true }),
        ],
        server_knowledge: 1,
      });

      const result = await tool.execute({ budget_id: 'test-budget' });

      expect(result.filtered_count).toBe(1);
      expect(result.accounts[0].closed).toBe(false);
    });

    it('includes closed accounts when include_closed is true', async () => {
      client.getAccounts.mockResolvedValue({
        accounts: [
          createMockAccount({ id: '1', closed: false }),
          createMockAccount({ id: '2', closed: true }),
        ],
        server_knowledge: 1,
      });

      const result = await tool.execute({
        budget_id: 'test-budget',
        include_closed: true,
      });

      expect(result.filtered_count).toBe(2);
    });

    it('passes last_knowledge_of_server to API', async () => {
      client.getAccounts.mockResolvedValue({
        accounts: [],
        server_knowledge: 100,
      });

      await tool.execute({
        budget_id: 'test-budget',
        last_knowledge_of_server: 50,
      });

      expect(client.getAccounts).toHaveBeenCalledWith('test-budget', 50);
    });

    it('returns server_knowledge for delta sync', async () => {
      client.getAccounts.mockResolvedValue({
        accounts: [],
        server_knowledge: 12345,
      });

      const result = await tool.execute({ budget_id: 'test-budget' });

      expect(result.server_knowledge).toBe(12345);
    });

    it('sorts accounts by on_budget status, type, then name', async () => {
      client.getAccounts.mockResolvedValue({
        accounts: [
          createMockAccount({ id: '1', name: 'Zebra', type: 'savings', on_budget: false }),
          createMockAccount({ id: '2', name: 'Alpha', type: 'checking', on_budget: true }),
          createMockAccount({ id: '3', name: 'Beta', type: 'checking', on_budget: true }),
        ],
        server_knowledge: 1,
      });

      const result = await tool.execute({ budget_id: 'test-budget' });

      // On-budget accounts first (Alpha, Beta), then off-budget (Zebra)
      expect(result.accounts[0].name).toBe('Alpha');
      expect(result.accounts[1].name).toBe('Beta');
      expect(result.accounts[2].name).toBe('Zebra');
    });

    it('handles API errors gracefully', async () => {
      client.getAccounts.mockRejectedValue(new Error('API error'));

      await expect(tool.execute({ budget_id: 'test-budget' }))
        .rejects.toThrow('get accounts failed');
    });
  });
});
