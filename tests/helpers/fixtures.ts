/**
 * Test Fixture Factories
 *
 * Factory functions for creating test data matching YNAB API response shapes.
 * Based on recorded fixtures from tests/fixtures/recorded/
 */

import type {
  YnabBudget,
  YnabAccount,
  YnabTransaction,
  YnabCategory,
  YnabCategoryGroup,
  YnabPayee,
  YnabScheduledTransaction,
} from '../../src/types/index.js';

let idCounter = 0;

function generateId(): string {
  return `test-${++idCounter}-${Math.random().toString(36).substring(2, 9)}`;
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Reset ID counter (useful between test suites)
 */
export function resetIdCounter(): void {
  idCounter = 0;
}

/**
 * Create a mock budget
 */
export function createMockBudget(overrides: Partial<YnabBudget> = {}): YnabBudget {
  return {
    id: generateUUID(),
    name: 'Test Budget',
    last_modified_on: new Date().toISOString(),
    first_month: '2024-01-01',
    last_month: '2024-12-01',
    date_format: { format: 'MM/DD/YYYY' },
    currency_format: {
      iso_code: 'USD',
      example_format: '123,456.78',
      decimal_digits: 2,
      decimal_separator: '.',
      symbol_first: true,
      group_separator: ',',
      currency_symbol: '$',
      display_symbol: true,
    },
    ...overrides,
  } as YnabBudget;
}

/**
 * Create a mock account
 */
export function createMockAccount(overrides: Partial<YnabAccount> = {}): YnabAccount {
  const id = generateUUID();
  return {
    id,
    name: 'Test Checking',
    type: 'checking',
    on_budget: true,
    closed: false,
    note: null,
    balance: 1000000, // $1000 in milliunits
    cleared_balance: 1000000,
    uncleared_balance: 0,
    transfer_payee_id: generateUUID(),
    direct_import_linked: false,
    direct_import_in_error: false,
    last_reconciled_at: null,
    debt_original_balance: null,
    deleted: false,
    ...overrides,
  } as YnabAccount;
}

/**
 * Create a mock transaction
 */
export function createMockTransaction(overrides: Partial<YnabTransaction> = {}): YnabTransaction {
  const id = generateId();
  return {
    id,
    date: new Date().toISOString().split('T')[0],
    amount: -50000, // -$50 in milliunits
    memo: null,
    cleared: 'cleared',
    approved: true,
    flag_color: null,
    flag_name: null,
    account_id: generateUUID(),
    account_name: 'Checking',
    payee_id: generateUUID(),
    payee_name: 'Test Payee',
    category_id: generateUUID(),
    category_name: 'Groceries',
    transfer_account_id: null,
    transfer_transaction_id: null,
    matched_transaction_id: null,
    import_id: null,
    import_payee_name: null,
    import_payee_name_original: null,
    debt_transaction_type: null,
    deleted: false,
    subtransactions: [],
    ...overrides,
  } as YnabTransaction;
}

/**
 * Create a mock split transaction with subtransactions
 */
export function createMockSplitTransaction(
  subtransactionCount: number = 2,
  overrides: Partial<YnabTransaction> = {}
): YnabTransaction {
  const transactionId = generateId();
  const totalAmount = -100000; // -$100

  const subtransactions = Array.from({ length: subtransactionCount }, (_, i) => ({
    id: `${transactionId}_sub${i + 1}`,
    transaction_id: transactionId,
    amount: Math.floor(totalAmount / subtransactionCount),
    memo: `Split ${i + 1}`,
    payee_id: null,
    payee_name: null,
    category_id: generateUUID(),
    category_name: `Category ${i + 1}`,
    transfer_account_id: null,
    transfer_transaction_id: null,
    deleted: false,
  }));

  return createMockTransaction({
    id: transactionId,
    amount: totalAmount,
    category_id: null,
    category_name: 'Split',
    subtransactions,
    ...overrides,
  });
}

/**
 * Create a mock transfer transaction
 */
export function createMockTransfer(
  fromAccountId: string,
  toAccountId: string,
  amount: number = 100000
): { outflow: YnabTransaction; inflow: YnabTransaction } {
  const outflowId = generateId();
  const inflowId = generateId();

  const outflow = createMockTransaction({
    id: outflowId,
    account_id: fromAccountId,
    account_name: 'From Account',
    amount: -amount,
    transfer_account_id: toAccountId,
    transfer_transaction_id: inflowId,
    payee_id: null,
    payee_name: 'Transfer : To Account',
    category_id: null,
    category_name: null,
  });

  const inflow = createMockTransaction({
    id: inflowId,
    account_id: toAccountId,
    account_name: 'To Account',
    amount: amount,
    transfer_account_id: fromAccountId,
    transfer_transaction_id: outflowId,
    payee_id: null,
    payee_name: 'Transfer : From Account',
    category_id: null,
    category_name: null,
  });

  return { outflow, inflow };
}

/**
 * Create a mock category
 */
export function createMockCategory(overrides: Partial<YnabCategory> = {}): YnabCategory {
  return {
    id: generateUUID(),
    name: 'Test Category',
    category_group_id: generateUUID(),
    hidden: false,
    budgeted: 500000, // $500 budgeted
    activity: -100000, // -$100 spent
    balance: 400000, // $400 remaining
    goal_type: null,
    goal_target: null,
    goal_target_month: null,
    deleted: false,
    ...overrides,
  } as YnabCategory;
}

/**
 * Create a mock category group with categories
 */
export function createMockCategoryGroup(
  categoryCount: number = 3,
  overrides: Partial<YnabCategoryGroup> = {}
): YnabCategoryGroup {
  const groupId = generateUUID();
  const categories = Array.from({ length: categoryCount }, (_, i) =>
    createMockCategory({
      category_group_id: groupId,
      name: `Category ${i + 1}`,
    })
  );

  return {
    id: groupId,
    name: 'Test Category Group',
    hidden: false,
    deleted: false,
    categories,
    ...overrides,
  } as YnabCategoryGroup;
}

/**
 * Create a mock payee
 */
export function createMockPayee(overrides: Partial<YnabPayee> = {}): YnabPayee {
  return {
    id: generateUUID(),
    name: 'Test Payee',
    transfer_account_id: null,
    deleted: false,
    ...overrides,
  } as YnabPayee;
}

/**
 * Create a mock transfer payee (linked to an account)
 */
export function createMockTransferPayee(accountId: string, accountName: string): YnabPayee {
  return createMockPayee({
    name: `Transfer : ${accountName}`,
    transfer_account_id: accountId,
  });
}

/**
 * Create a mock scheduled transaction
 */
export function createMockScheduledTransaction(
  overrides: Partial<YnabScheduledTransaction> = {}
): YnabScheduledTransaction {
  return {
    id: generateUUID(),
    date_first: '2024-01-15',
    date_next: '2024-02-15',
    frequency: 'monthly',
    amount: -100000, // -$100
    memo: null,
    flag_color: null,
    flag_name: null,
    account_id: generateUUID(),
    account_name: 'Checking',
    payee_id: generateUUID(),
    payee_name: 'Monthly Bill',
    category_id: generateUUID(),
    category_name: 'Bills',
    transfer_account_id: null,
    deleted: false,
    subtransactions: [],
    ...overrides,
  } as YnabScheduledTransaction;
}

/**
 * Create a mock budget month
 */
export function createMockBudgetMonth(
  month: string = '2024-01-01',
  categories: YnabCategory[] = []
): {
  month: string;
  income: number;
  budgeted: number;
  activity: number;
  to_be_budgeted: number;
  categories: YnabCategory[];
} {
  const totalBudgeted = categories.reduce((sum, c) => sum + c.budgeted, 0);
  const totalActivity = categories.reduce((sum, c) => sum + c.activity, 0);

  return {
    month,
    income: 5000000, // $5000
    budgeted: totalBudgeted || 4000000, // $4000
    activity: totalActivity || -2000000, // -$2000
    to_be_budgeted: 1000000, // $1000
    categories: categories.length ? categories : [createMockCategory(), createMockCategory()],
  };
}
