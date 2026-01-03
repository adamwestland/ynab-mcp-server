/**
 * Mock YNAB Client for Testing
 *
 * Provides a configurable mock of YNABClient for tool testing.
 */

import { vi } from 'vitest';
import type { YNABClient } from '../../src/client/YNABClient.js';
import type {
  YnabBudgetsResponse,
  YnabAccountsResponse,
  YnabTransactionsResponse,
  YnabCategoriesResponse,
  YnabPayeesResponse,
  YnabTransactionResponse,
  YnabCategoryResponse,
  YnabPayeeResponse,
  YnabBudgetMonthResponse,
  YnabScheduledTransactionsResponse,
  YnabScheduledTransactionResponse,
  YnabScheduledTransaction,
} from '../../src/types/index.js';

export interface MockClientOptions {
  budgets?: YnabBudgetsResponse;
  accounts?: YnabAccountsResponse;
  transactions?: YnabTransactionsResponse;
  categories?: YnabCategoriesResponse;
  payees?: YnabPayeesResponse;
  scheduledTransactions?: YnabScheduledTransactionsResponse;
  budgetMonth?: YnabBudgetMonthResponse;
}

export type MockYNABClient = {
  [K in keyof YNABClient]: YNABClient[K] extends (...args: infer A) => infer R
    ? ReturnType<typeof vi.fn<A, R>>
    : YNABClient[K];
};

/**
 * Creates a mock YNABClient with configurable responses
 */
export function createMockClient(options: MockClientOptions = {}): MockYNABClient {
  const mockClient = {
    // Budget methods
    getBudgets: vi.fn().mockResolvedValue(options.budgets ?? { budgets: [], default_budget: null }),
    getBudget: vi.fn().mockResolvedValue(options.budgets?.budgets[0] ?? null),

    // Account methods
    getAccounts: vi.fn().mockResolvedValue(options.accounts ?? { accounts: [], server_knowledge: 0 }),
    getAccount: vi.fn().mockResolvedValue(options.accounts?.accounts[0] ?? null),

    // Transaction methods
    getTransactions: vi.fn().mockResolvedValue(options.transactions ?? { transactions: [], server_knowledge: 0 }),
    getAccountTransactions: vi.fn().mockResolvedValue(options.transactions ?? { transactions: [], server_knowledge: 0 }),
    getTransaction: vi.fn().mockResolvedValue(options.transactions?.transactions[0] ?? null),
    createTransaction: vi.fn().mockImplementation(async (_budgetId, transaction) => ({
      transaction: { id: 'new-tx-id', ...transaction },
    })),
    createTransactions: vi.fn().mockImplementation(async (_budgetId, transactions) => ({
      transactions: transactions.map((tx: Record<string, unknown>, i: number) => ({ id: `new-tx-${i}`, ...tx })),
      duplicate_import_ids: [],
      server_knowledge: 1,
    })),
    updateTransaction: vi.fn().mockImplementation(async (_budgetId, transactionId, transaction) => ({
      transaction: { id: transactionId, ...transaction },
    })),
    updateTransactions: vi.fn().mockImplementation(async (_budgetId, transactions) => ({
      transactions: transactions.map((tx: { id: string }) => ({ ...tx })),
      server_knowledge: 1,
    })),

    // Category methods
    getCategories: vi.fn().mockResolvedValue(options.categories ?? { category_groups: [], server_knowledge: 0 }),
    getCategory: vi.fn().mockImplementation(async (_budgetId, categoryId) => ({
      category: { id: categoryId, name: 'Test Category', budgeted: 0, activity: 0, balance: 0 },
    })),
    updateCategoryBudget: vi.fn().mockImplementation(async (_budgetId, categoryId, _month, budgeted) => ({
      category: { id: categoryId, budgeted },
    })),

    // Payee methods
    getPayees: vi.fn().mockResolvedValue(options.payees ?? { payees: [], server_knowledge: 0 }),
    getPayee: vi.fn().mockImplementation(async (_budgetId, payeeId) => ({
      payee: { id: payeeId, name: 'Test Payee', deleted: false },
    })),
    createPayee: vi.fn().mockImplementation(async (_budgetId, payee) => ({
      payee: { id: 'new-payee-id', ...payee, deleted: false },
    })),

    // Scheduled transaction methods
    getScheduledTransactions: vi.fn().mockResolvedValue(
      options.scheduledTransactions ?? { scheduled_transactions: [], server_knowledge: 0 }
    ),
    getScheduledTransaction: vi.fn().mockImplementation(async (_budgetId, stxId) => ({
      id: stxId,
      date_first: '2024-01-01',
      date_next: '2024-02-01',
      frequency: 'monthly',
      amount: -100000,
      deleted: false,
    } as YnabScheduledTransaction)),
    createScheduledTransaction: vi.fn().mockImplementation(async (_budgetId, stx) => ({
      scheduled_transaction: { id: 'new-stx-id', ...stx },
    })),
    updateScheduledTransaction: vi.fn().mockImplementation(async (_budgetId, stxId, stx) => ({
      scheduled_transaction: { id: stxId, ...stx },
    })),
    deleteScheduledTransaction: vi.fn().mockResolvedValue(undefined),

    // Budget month methods
    getBudgetMonth: vi.fn().mockResolvedValue(
      options.budgetMonth ?? {
        month: {
          month: '2024-01-01',
          income: 0,
          budgeted: 0,
          activity: 0,
          to_be_budgeted: 0,
          categories: [],
        },
      }
    ),

    // Utility methods
    getRateLimitStatus: vi.fn().mockReturnValue({ remaining: 200, resetAt: Date.now() + 3600000 }),
    getRemainingTokens: vi.fn().mockReturnValue(200),
    resetRateLimit: vi.fn(),
    healthCheck: vi.fn().mockResolvedValue({ status: 'healthy', latency: 100 }),

    // HTTP methods (for advanced testing)
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  } as unknown as MockYNABClient;

  return mockClient;
}

/**
 * Helper to configure mock responses for specific scenarios
 */
export function configureMockResponse<T>(
  mockFn: ReturnType<typeof vi.fn>,
  response: T
): void {
  mockFn.mockResolvedValue(response);
}

/**
 * Helper to configure mock to throw an error
 */
export function configureMockError(
  mockFn: ReturnType<typeof vi.fn>,
  error: Error
): void {
  mockFn.mockRejectedValue(error);
}

/**
 * Reset all mocks on a mock client
 */
export function resetMockClient(client: MockYNABClient): void {
  Object.values(client).forEach((value) => {
    if (typeof value === 'function' && 'mockReset' in value) {
      (value as ReturnType<typeof vi.fn>).mockReset();
    }
  });
}
