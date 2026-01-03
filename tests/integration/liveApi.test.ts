/**
 * Live API Validation Tests
 *
 * These tests validate that recorded fixtures match expected YNAB API response shapes.
 * They also run live API calls when YNAB_API_TOKEN is available.
 *
 * Run with: npm run test:live
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../fixtures/recorded');

// Check if we have recorded fixtures
const hasFixtures = existsSync(join(FIXTURES_DIR, 'budgets.json'));

// Schema definitions based on YNAB API documentation
const BudgetSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  last_modified_on: z.string(),
  first_month: z.string(),
  last_month: z.string(),
  date_format: z.object({
    format: z.string(),
  }),
  currency_format: z.object({
    iso_code: z.string(),
    example_format: z.string(),
    decimal_digits: z.number(),
    decimal_separator: z.string(),
    symbol_first: z.boolean(),
    group_separator: z.string(),
    currency_symbol: z.string(),
    display_symbol: z.boolean(),
  }),
});

const AccountSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: z.string(),
  on_budget: z.boolean(),
  closed: z.boolean(),
  note: z.string().nullable(),
  balance: z.number(),
  cleared_balance: z.number(),
  uncleared_balance: z.number(),
  transfer_payee_id: z.string().uuid(),
  direct_import_linked: z.boolean().optional(),
  direct_import_in_error: z.boolean().optional(),
  last_reconciled_at: z.string().nullable().optional(),
  debt_original_balance: z.number().nullable().optional(),
  deleted: z.boolean(),
});

const CategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  category_group_id: z.string().uuid(),
  hidden: z.boolean(),
  budgeted: z.number(),
  activity: z.number(),
  balance: z.number(),
  goal_type: z.string().nullable(),
  goal_target: z.number().nullable().optional(),
  goal_target_month: z.string().nullable().optional(),
  deleted: z.boolean(),
});

const PayeeSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  transfer_account_id: z.string().uuid().nullable(),
  deleted: z.boolean(),
});

const TransactionSchema = z.object({
  id: z.string(),
  date: z.string(),
  amount: z.number(),
  memo: z.string().nullable(),
  cleared: z.string(),
  approved: z.boolean(),
  flag_color: z.string().nullable(),
  flag_name: z.string().nullable().optional(),
  account_id: z.string().uuid(),
  account_name: z.string(),
  payee_id: z.string().uuid().nullable(),
  payee_name: z.string().nullable(),
  category_id: z.string().uuid().nullable(),
  category_name: z.string().nullable(),
  transfer_account_id: z.string().uuid().nullable(),
  transfer_transaction_id: z.string().nullable(),
  matched_transaction_id: z.string().nullable(),
  import_id: z.string().nullable(),
  import_payee_name: z.string().nullable().optional(),
  import_payee_name_original: z.string().nullable().optional(),
  debt_transaction_type: z.string().nullable().optional(),
  deleted: z.boolean(),
  subtransactions: z.array(z.object({
    id: z.string(),
    transaction_id: z.string(),
    amount: z.number(),
    memo: z.string().nullable(),
    payee_id: z.string().uuid().nullable(),
    payee_name: z.string().nullable().optional(),
    category_id: z.string().uuid().nullable(),
    category_name: z.string().nullable().optional(),
    transfer_account_id: z.string().uuid().nullable(),
    transfer_transaction_id: z.string().nullable().optional(),
    deleted: z.boolean(),
  })).optional(),
});

const ScheduledTransactionSchema = z.object({
  id: z.string().uuid(),
  date_first: z.string(),
  date_next: z.string().nullable(),
  frequency: z.string(),
  amount: z.number(),
  memo: z.string().nullable(),
  flag_color: z.string().nullable(),
  flag_name: z.string().nullable().optional(),
  account_id: z.string().uuid(),
  account_name: z.string(),
  payee_id: z.string().uuid().nullable(),
  payee_name: z.string().nullable(),
  category_id: z.string().uuid().nullable(),
  category_name: z.string().nullable(),
  transfer_account_id: z.string().uuid().nullable(),
  deleted: z.boolean(),
});

// Helper to load and parse fixture
function loadFixture<T>(name: string): T {
  const filePath = join(FIXTURES_DIR, `${name}.json`);
  const content = readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(content);
  return parsed.data;
}

describe.skipIf(!hasFixtures)('Recorded Fixture Validation', () => {
  describe('Budgets', () => {
    it('has valid budget structure', () => {
      const data = loadFixture<{ budgets: unknown[] }>('budgets');
      expect(data.budgets).toBeDefined();
      expect(Array.isArray(data.budgets)).toBe(true);
      expect(data.budgets.length).toBeGreaterThan(0);
    });

    it('budgets match expected schema', () => {
      const data = loadFixture<{ budgets: unknown[] }>('budgets');
      for (const budget of data.budgets) {
        const result = BudgetSchema.safeParse(budget);
        if (!result.success) {
          console.error('Budget validation failed:', result.error.issues);
        }
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Accounts', () => {
    it('has valid accounts structure', () => {
      const data = loadFixture<{ accounts: unknown[] }>('accounts');
      expect(data.accounts).toBeDefined();
      expect(Array.isArray(data.accounts)).toBe(true);
    });

    it('accounts match expected schema', () => {
      const data = loadFixture<{ accounts: unknown[] }>('accounts');
      for (const account of data.accounts) {
        const result = AccountSchema.safeParse(account);
        if (!result.success) {
          console.error('Account validation failed:', result.error.issues);
        }
        expect(result.success).toBe(true);
      }
    });

    it('has server_knowledge field', () => {
      const data = loadFixture<{ server_knowledge: number }>('accounts');
      expect(data.server_knowledge).toBeDefined();
      expect(typeof data.server_knowledge).toBe('number');
    });
  });

  describe('Categories', () => {
    it('has valid category groups structure', () => {
      const data = loadFixture<{ category_groups: unknown[] }>('categories');
      expect(data.category_groups).toBeDefined();
      expect(Array.isArray(data.category_groups)).toBe(true);
    });

    it('category groups contain categories', () => {
      const data = loadFixture<{ category_groups: Array<{ categories: unknown[] }> }>('categories');
      for (const group of data.category_groups) {
        expect(group.categories).toBeDefined();
        expect(Array.isArray(group.categories)).toBe(true);
      }
    });

    it('categories match expected schema', () => {
      const data = loadFixture<{ category_groups: Array<{ categories: unknown[] }> }>('categories');
      for (const group of data.category_groups) {
        for (const category of group.categories) {
          const result = CategorySchema.safeParse(category);
          if (!result.success) {
            console.error('Category validation failed:', result.error.issues);
          }
          expect(result.success).toBe(true);
        }
      }
    });
  });

  describe('Payees', () => {
    it('has valid payees structure', () => {
      const data = loadFixture<{ payees: unknown[] }>('payees');
      expect(data.payees).toBeDefined();
      expect(Array.isArray(data.payees)).toBe(true);
    });

    it('payees match expected schema', () => {
      const data = loadFixture<{ payees: unknown[] }>('payees');
      // Only validate first 100 to speed up test
      const sample = data.payees.slice(0, 100);
      for (const payee of sample) {
        const result = PayeeSchema.safeParse(payee);
        if (!result.success) {
          console.error('Payee validation failed:', result.error.issues);
        }
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Transactions', () => {
    it('has valid transactions structure', () => {
      const data = loadFixture<{ transactions: unknown[] }>('transactions');
      expect(data.transactions).toBeDefined();
      expect(Array.isArray(data.transactions)).toBe(true);
    });

    it('transactions match expected schema', () => {
      const data = loadFixture<{ transactions: unknown[] }>('transactions');
      for (const transaction of data.transactions) {
        const result = TransactionSchema.safeParse(transaction);
        if (!result.success) {
          console.error('Transaction validation failed:', result.error.issues);
        }
        expect(result.success).toBe(true);
      }
    });

    it('transactions have required fields for tools', () => {
      const data = loadFixture<{ transactions: Array<Record<string, unknown>> }>('transactions');
      for (const tx of data.transactions) {
        expect(tx).toHaveProperty('id');
        expect(tx).toHaveProperty('date');
        expect(tx).toHaveProperty('amount');
        expect(tx).toHaveProperty('account_id');
        expect(tx).toHaveProperty('cleared');
        expect(tx).toHaveProperty('approved');
      }
    });
  });

  describe('Scheduled Transactions', () => {
    it('has valid scheduled transactions structure', () => {
      const data = loadFixture<{ scheduled_transactions: unknown[] }>('scheduled-transactions');
      expect(data.scheduled_transactions).toBeDefined();
      expect(Array.isArray(data.scheduled_transactions)).toBe(true);
    });

    it('scheduled transactions match expected schema', () => {
      const data = loadFixture<{ scheduled_transactions: unknown[] }>('scheduled-transactions');
      for (const stx of data.scheduled_transactions) {
        const result = ScheduledTransactionSchema.safeParse(stx);
        if (!result.success) {
          console.error('Scheduled transaction validation failed:', result.error.issues);
        }
        expect(result.success).toBe(true);
      }
    });

    it('scheduled transactions have valid frequency values', () => {
      const validFrequencies = [
        'never', 'daily', 'weekly', 'everyOtherWeek', 'twiceAMonth',
        'every4Weeks', 'monthly', 'everyOtherMonth', 'every3Months',
        'every4Months', 'twiceAYear', 'yearly', 'everyOtherYear',
      ];
      const data = loadFixture<{ scheduled_transactions: Array<{ frequency: string }> }>('scheduled-transactions');
      for (const stx of data.scheduled_transactions) {
        expect(validFrequencies).toContain(stx.frequency);
      }
    });
  });

  describe('Budget Month', () => {
    it('has valid month structure', () => {
      const data = loadFixture<{ month: Record<string, unknown> }>('month');
      expect(data.month).toBeDefined();
      expect(typeof data.month).toBe('object');
    });

    it('month has required budget fields', () => {
      const data = loadFixture<{ month: Record<string, unknown> }>('month');
      const month = data.month;
      expect(month).toHaveProperty('month');
      expect(month).toHaveProperty('income');
      expect(month).toHaveProperty('budgeted');
      expect(month).toHaveProperty('activity');
      expect(month).toHaveProperty('to_be_budgeted');
    });

    it('month contains categories', () => {
      const data = loadFixture<{ month: { categories: unknown[] } }>('month');
      expect(data.month.categories).toBeDefined();
      expect(Array.isArray(data.month.categories)).toBe(true);
    });
  });
});

// Live API tests - only run when token is available
const hasToken = !!process.env.YNAB_API_TOKEN;

describe.skipIf(!hasToken)('Live API Validation', () => {
  let client: Awaited<ReturnType<typeof import('../../src/client/YNABClient.js').YNABClient>>;

  beforeAll(async () => {
    const { YNABClient } = await import('../../src/client/YNABClient.js');
    const { config } = await import('../../src/config/index.js');
    client = new YNABClient(config);
  });

  it('can connect to YNAB API', async () => {
    const health = await client.healthCheck();
    expect(health.status).toBe('healthy');
    expect(health.latency).toBeDefined();
    expect(health.latency).toBeLessThan(5000); // Less than 5 seconds
  });

  it('can fetch budgets', async () => {
    const response = await client.getBudgets();
    expect(response.budgets).toBeDefined();
    expect(Array.isArray(response.budgets)).toBe(true);
  });
});
