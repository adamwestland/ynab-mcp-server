/**
 * Tool Registry Tests - Verify all tools are properly registered
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { registerTools } from '../../src/tools/index.js';
import { createMockClient, type MockYNABClient } from '../helpers/mockClient.js';

describe('Tool Registry', () => {
  let mockClient: MockYNABClient;
  let registeredTools: ReturnType<typeof registerTools>;

  beforeAll(() => {
    mockClient = createMockClient();
    registeredTools = registerTools(mockClient as any);
  });

  describe('registerTools', () => {
    it('returns an array of tools', () => {
      expect(Array.isArray(registeredTools)).toBe(true);
      expect(registeredTools.length).toBeGreaterThan(0);
    });

    it('all tools have required interface', () => {
      for (const tool of registeredTools) {
        expect(tool.name).toBeDefined();
        expect(typeof tool.name).toBe('string');
        expect(tool.name).toMatch(/^ynab_/);

        expect(tool.description).toBeDefined();
        expect(typeof tool.description).toBe('string');
        expect(tool.description.length).toBeGreaterThan(0);

        expect(tool.inputSchema).toBeDefined();
        expect(typeof tool.execute).toBe('function');
      }
    });
  });

  describe('Budget tools', () => {
    it('registers list_budgets tool', () => {
      const tool = registeredTools.find(t => t.name === 'ynab_list_budgets');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('budget');
    });
  });

  describe('Account tools', () => {
    it('registers get_accounts tool', () => {
      const tool = registeredTools.find(t => t.name === 'ynab_get_accounts');
      expect(tool).toBeDefined();
    });
  });

  describe('Transaction tools', () => {
    it('registers get_transactions tool', () => {
      const tool = registeredTools.find(t => t.name === 'ynab_get_transactions');
      expect(tool).toBeDefined();
    });

    it('registers create_transaction tool', () => {
      const tool = registeredTools.find(t => t.name === 'ynab_create_transaction');
      expect(tool).toBeDefined();
    });

    it('registers update_transaction tool', () => {
      const tool = registeredTools.find(t => t.name === 'ynab_update_transaction');
      expect(tool).toBeDefined();
    });

    it('registers delete_transaction tool', () => {
      const tool = registeredTools.find(t => t.name === 'ynab_delete_transaction');
      expect(tool).toBeDefined();
    });
  });

  describe('Category tools', () => {
    it('registers get_categories tool', () => {
      const tool = registeredTools.find(t => t.name === 'ynab_get_categories');
      expect(tool).toBeDefined();
    });

    it('registers get_category tool', () => {
      const tool = registeredTools.find(t => t.name === 'ynab_get_category');
      expect(tool).toBeDefined();
    });

    it('registers update_category_budget tool', () => {
      const tool = registeredTools.find(t => t.name === 'ynab_update_category_budget');
      expect(tool).toBeDefined();
    });
  });

  describe('Payee tools', () => {
    it('registers get_payees tool', () => {
      const tool = registeredTools.find(t => t.name === 'ynab_get_payees');
      expect(tool).toBeDefined();
    });

    it('registers get_payee tool', () => {
      const tool = registeredTools.find(t => t.name === 'ynab_get_payee');
      expect(tool).toBeDefined();
    });

    it('registers create_payee tool', () => {
      const tool = registeredTools.find(t => t.name === 'ynab_create_payee');
      expect(tool).toBeDefined();
    });
  });

  describe('Scheduled transaction tools', () => {
    it('registers get_scheduled_transactions tool', () => {
      const tool = registeredTools.find(t => t.name === 'ynab_get_scheduled_transactions');
      expect(tool).toBeDefined();
    });

    it('registers get_scheduled_transaction tool', () => {
      const tool = registeredTools.find(t => t.name === 'ynab_get_scheduled_transaction');
      expect(tool).toBeDefined();
    });

    it('registers create_scheduled_transaction tool', () => {
      const tool = registeredTools.find(t => t.name === 'ynab_create_scheduled_transaction');
      expect(tool).toBeDefined();
    });

    it('registers update_scheduled_transaction tool', () => {
      const tool = registeredTools.find(t => t.name === 'ynab_update_scheduled_transaction');
      expect(tool).toBeDefined();
    });

    it('registers delete_scheduled_transaction tool', () => {
      const tool = registeredTools.find(t => t.name === 'ynab_delete_scheduled_transaction');
      expect(tool).toBeDefined();
    });
  });

  describe('Transfer tools', () => {
    it('registers create_transfer tool', () => {
      const tool = registeredTools.find(t => t.name === 'ynab_create_transfer');
      expect(tool).toBeDefined();
    });

    it('registers unlink_transfer tool', () => {
      const tool = registeredTools.find(t => t.name === 'ynab_unlink_transfer');
      expect(tool).toBeDefined();
    });
  });

  describe('Month tools', () => {
    it('registers get_budget_month tool', () => {
      const tool = registeredTools.find(t => t.name === 'ynab_get_budget_month');
      expect(tool).toBeDefined();
    });
  });

  describe('Import tools', () => {
    it('registers import_transactions tool', () => {
      const tool = registeredTools.find(t => t.name === 'ynab_import_transactions');
      expect(tool).toBeDefined();
    });
  });

  describe('Intelligence tools', () => {
    it('registers analyze_spending_patterns tool', () => {
      const tool = registeredTools.find(t => t.name === 'ynab_analyze_spending_patterns');
      expect(tool).toBeDefined();
    });

    it('registers distribute_to_be_budgeted tool', () => {
      const tool = registeredTools.find(t => t.name === 'ynab_distribute_to_be_budgeted');
      expect(tool).toBeDefined();
    });

    it('registers recommend_category_allocation tool', () => {
      const tool = registeredTools.find(t => t.name === 'ynab_recommend_category_allocation');
      expect(tool).toBeDefined();
    });
  });

  describe('Tool uniqueness', () => {
    it('all tool names are unique', () => {
      const names = registeredTools.map(t => t.name);
      const uniqueNames = new Set(names);
      expect(names.length).toBe(uniqueNames.size);
    });
  });

  describe('Tool count', () => {
    it('has at least 25 tools registered', () => {
      expect(registeredTools.length).toBeGreaterThanOrEqual(25);
    });
  });
});
