# YNAB MCP Server - Complete Tool Reference

This document provides comprehensive documentation for all 30+ tools available in the YNAB MCP Server. Tools are organized by category and include detailed parameter descriptions, response formats, and usage examples.

## Table of Contents

- [Budget & Account Management](#budget--account-management)
- [Transaction Management](#transaction-management)
- [Category & Budget Management](#category--budget-management)
- [Budgeting Automation](#budgeting-automation)
- [Payee Management](#payee-management)
- [Scheduled Transactions](#scheduled-transactions)
- [Transfer Management](#transfer-management)
- [Import Tools](#import-tools)
- [Analysis & Allocation](#analysis--allocation)
- [Common Patterns](#common-patterns)
- [Error Handling](#error-handling)

---

## Budget & Account Management

### `ynab_list_budgets`

Get all budgets accessible to the user.

**Parameters:**
```typescript
{
  include_accounts?: boolean;  // Include account details for each budget
}
```

**Response:**
```typescript
{
  budgets: Array<{
    id: string;
    name: string;
    currency_format: {
      iso_code: string;
      example_format: string;
      decimal_digits: number;
      decimal_separator: string;
      symbol_first: boolean;
      group_separator: string;
      currency_symbol: string;
      display_symbol: boolean;
    };
    date_format: {
      format: string;
    };
    first_month: string;
    last_month: string;
    accounts?: Array<{
      id: string;
      name: string;
      type: string;
      balance: number;
      cleared_balance: number;
      uncleared_balance: number;
    }>;
  }>;
  default_budget?: {
    id: string;
    name: string;
  };
}
```

**Example:**
```json
{
  "include_accounts": true
}
```

**Use Cases:**
- Initial budget discovery and selection
- Getting currency format for display purposes
- Listing all available budgets for user selection

---

### `ynab_get_accounts`

Get all accounts for a specific budget with detailed balance information.

**Parameters:**
```typescript
{
  budget_id: string;                    // Required: Budget ID
  last_knowledge_of_server?: number;   // For delta sync
  account_type?: string;               // Filter by account type
  on_budget_only?: boolean;            // Only on-budget accounts
  include_closed?: boolean;            // Include closed accounts (default: false)
}
```

**Response:**
```typescript
{
  accounts: Array<{
    id: string;
    name: string;
    type: 'checking' | 'savings' | 'creditCard' | 'cash' | 'lineOfCredit' | 'otherAsset' | 'otherLiability' | 'mortgage' | 'autoLoan' | 'studentLoan' | 'personalLoan' | 'medicalDebt' | 'otherDebt';
    on_budget: boolean;
    closed: boolean;
    note: string | null;
    balance: number;                    // Current balance in milliunits
    cleared_balance: number;           // Cleared balance in milliunits  
    uncleared_balance: number;         // Uncleared balance in milliunits
    transfer_payee_id: string;         // For linking transfers
    direct_import_linked: boolean;
    direct_import_in_error: boolean;
    formatted_balance: string;         // Human readable balance
  }>;
  server_knowledge: number;
}
```

**Example:**
```json
{
  "budget_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "on_budget_only": true,
  "include_closed": false
}
```

**Account Types:**
- **On-Budget**: `checking`, `savings`, `cash`
- **Credit Cards**: `creditCard`
- **Loans**: `mortgage`, `autoLoan`, `studentLoan`, `personalLoan`
- **Debts**: `medicalDebt`, `otherDebt`
- **Assets**: `otherAsset`
- **Liabilities**: `lineOfCredit`, `otherLiability`

---

### `ynab_get_budget_month`

Get budget data for a specific month. Response is trimmed by default to keep payloads small: only active categories are included, goal metadata and deleted categories are always omitted.

**Parameters:**
```typescript
{
  budget_id: string;          // Required: Budget ID
  month: string;              // Required: YYYY-MM-01 (first day of month)
  category_filter?:           // Default: 'active'
    | 'active'          // budgeted/activity/balance non-zero
    | 'with_activity'   // activity non-zero
    | 'with_balance'    // balance non-zero
    | 'all';            // every non-deleted category (including zero-balance)
}
```

**Response:**
```typescript
{
  month: {
    month: string;
    income: { milliunits: number; formatted: string };
    budgeted: { milliunits: number; formatted: string };
    activity: { milliunits: number; formatted: string };
    to_be_budgeted: { milliunits: number; formatted: string };
    age_of_money: number | null;
    note?: string;            // Only present when non-empty
    categories: Array<{
      id: string;
      category_group_id: string;
      category_group_name: string;
      name: string;
      hidden: boolean;
      budgeted: { milliunits: number; formatted: string };
      activity: { milliunits: number; formatted: string };
      balance: { milliunits: number; formatted: string };
      note?: string;          // Only present when non-empty
    }>;
  };
  server_knowledge: number;
}
```

**Notes:**
- Goal fields (`goal_type`, `goal_target`, `goal_percentage_complete`, etc.) are never returned. Use `ynab_get_category` when goal metadata is needed for a specific category.
- `deleted` categories are always excluded, regardless of `category_filter`.
- Default `'active'` is tuned for the common "show me what's happening this month" use. Use `'all'` for full dumps or diffing against external data.

**Example:**
```json
{
  "budget_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "month": "2024-01-01",
  "category_filter": "active"
}
```

---

## Transaction Management

### `ynab_get_transactions`

Query transactions with comprehensive filtering options.

**Parameters:**
```typescript
{
  budget_id: string;                    // Required: Budget ID
  account_id?: string;                  // Filter to specific account
  since_date?: string;                  // YYYY-MM-DD format
  type?: 'uncategorized' | 'unapproved'; // Filter by type
  last_knowledge_of_server?: number;   // For delta sync
  category_id?: string;                 // Filter by category
  payee_id?: string;                    // Filter by payee
  cleared_status?: 'cleared' | 'uncleared' | 'reconciled';
  include_subtransactions?: boolean;    // Include splits (default: true)
  limit?: number;                       // Max transactions (max: 1000)
}
```

**Response:**
```typescript
{
  transactions: Array<{
    id: string;
    date: string;                       // YYYY-MM-DD
    amount: number;                     // In milliunits
    memo: string | null;
    cleared: 'cleared' | 'uncleared' | 'reconciled';
    approved: boolean;
    flag_color: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | null;
    account_id: string;
    account_name: string;
    payee_id: string | null;
    payee_name: string | null;
    category_id: string | null;
    category_name: string | null;
    transfer_account_id: string | null;
    transfer_transaction_id: string | null;
    matched_transaction_id: string | null;
    import_id: string | null;
    import_payee_name: string | null;
    import_payee_name_original: string | null;
    debt_transaction_type: string | null;
    deleted: boolean;
    subtransactions: Array<{
      id: string;
      transaction_id: string;
      amount: number;
      memo: string | null;
      payee_id: string | null;
      payee_name: string | null;
      category_id: string | null;
      category_name: string | null;
      transfer_account_id: string | null;
      transfer_transaction_id: string | null;
      deleted: boolean;
    }>;
    formatted_amount: string;           // Human readable amount
  }>;
  server_knowledge: number;
  duplicate_import_ids?: string[];     // If any import_id conflicts
}
```

**Example:**
```json
{
  "budget_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "since_date": "2024-01-01",
  "account_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "cleared_status": "cleared",
  "limit": 100
}
```

---

### `ynab_create_transaction`

Create a new transaction in YNAB.

**Parameters:**
```typescript
{
  budget_id: string;                    // Required: Budget ID
  account_id: string;                   // Required: Account ID
  category_id?: string | null;          // Category ID (null for transfers/income)
  payee_id?: string | null;             // Payee ID
  payee_name?: string;                  // Creates payee if doesn't exist
  amount: number;                       // Required: Amount in milliunits
  memo?: string;                        // Transaction memo
  date: string;                         // Required: YYYY-MM-DD format
  cleared?: 'cleared' | 'uncleared' | 'reconciled'; // Default: 'uncleared'
  approved?: boolean;                   // Default: true
  flag_color?: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | null;
  import_id?: string;                   // For deduplication
}
```

**Response:**
```typescript
{
  transaction: {
    id: string;
    date: string;
    amount: {
      milliunits: number;
      formatted: string;
    };
    memo: string | null;
    cleared: string;
    approved: boolean;
    flag_color: string | null;
    account_id: string;
    account_name: string;
    payee_id: string | null;
    payee_name: string | null;
    category_id: string | null;
    category_name: string | null;
    import_id: string | null;
  };
  payee_created?: {
    id: string;
    name: string;
  };
}
```

**Example:**
```json
{
  "budget_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "account_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "payee_name": "Coffee Shop",
  "amount": -4500,
  "memo": "Morning coffee",
  "date": "2024-01-15",
  "category_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "cleared": "cleared"
}
```

---

### `ynab_update_transaction`

Update an existing transaction.

**Parameters:**
```typescript
{
  budget_id: string;                    // Required: Budget ID
  transaction_id: string;               // Required: Transaction ID
  account_id?: string;                  // New account ID
  category_id?: string | null;          // New category ID
  payee_id?: string | null;             // New payee ID
  payee_name?: string;                  // Creates payee if doesn't exist
  amount?: number;                      // New amount in milliunits
  memo?: string;                        // New memo
  date?: string;                        // New date (YYYY-MM-DD)
  cleared?: 'cleared' | 'uncleared' | 'reconciled';
  approved?: boolean;
  flag_color?: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | null;
}
```

**Response:**
```typescript
{
  transaction: {
    id: string;
    // ... same structure as create_transaction response
  };
  changes_made: string[];               // List of fields that were changed
  payee_created?: {
    id: string;
    name: string;
  };
}
```

**Example:**
```json
{
  "budget_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "transaction_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "amount": -5000,
  "memo": "Updated coffee purchase",
  "cleared": "cleared"
}
```

---

### `ynab_delete_transaction`

Delete a transaction.

**Parameters:**
```typescript
{
  budget_id: string;                    // Required: Budget ID
  transaction_id: string;               // Required: Transaction ID
}
```

**Response:**
```typescript
{
  deleted_transaction: {
    id: string;
    deleted: true;
  };
  success: boolean;
}
```

---

### `ynab_batch_update_transactions`

Update multiple transactions in a single operation.

**Parameters:**
```typescript
{
  budget_id: string;                    // Required: Budget ID
  transactions: Array<{
    id: string;                         // Required: Transaction ID
    account_id?: string;
    category_id?: string | null;
    payee_id?: string | null;
    payee_name?: string;
    amount?: number;
    memo?: string;
    date?: string;
    cleared?: 'cleared' | 'uncleared' | 'reconciled';
    approved?: boolean;
    flag_color?: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | null;
  }>;
}
```

**Response:**
```typescript
{
  transactions: Array<{
    id: string;
    // ... updated transaction data
  }>;
  results: {
    updated_count: number;
    failed_count: number;
    errors: Array<{
      transaction_id: string;
      error: string;
    }>;
  };
  payees_created?: Array<{
    id: string;
    name: string;
  }>;
}
```

---

### `ynab_create_split_transaction`

Create a transaction with multiple splits (subtransactions).

**Parameters:**
```typescript
{
  budget_id: string;                    // Required: Budget ID
  account_id: string;                   // Required: Account ID
  payee_id?: string | null;
  payee_name?: string;
  date: string;                         // Required: YYYY-MM-DD
  memo?: string;
  cleared?: 'cleared' | 'uncleared' | 'reconciled';
  approved?: boolean;
  flag_color?: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | null;
  import_id?: string;
  subtransactions: Array<{              // Required: At least 2 splits
    amount: number;                     // Required: Amount in milliunits
    category_id?: string | null;
    payee_id?: string | null;
    payee_name?: string;
    memo?: string;
    transfer_account_id?: string | null;
  }>;
}
```

**Response:**
```typescript
{
  transaction: {
    id: string;
    date: string;
    amount: {
      milliunits: number;
      formatted: string;
    };
    subtransactions: Array<{
      id: string;
      amount: {
        milliunits: number;
        formatted: string;
      };
      category_id: string | null;
      category_name: string | null;
      payee_id: string | null;
      payee_name: string | null;
      memo: string | null;
    }>;
  };
  validation: {
    splits_sum_correct: boolean;
    total_splits: number;
  };
  payees_created?: Array<{
    id: string;
    name: string;
  }>;
}
```

---

### `ynab_update_transaction_splits`

Update the splits of an existing split transaction.

**Parameters:**
```typescript
{
  budget_id: string;                    // Required: Budget ID
  transaction_id: string;               // Required: Transaction ID
  subtransactions: Array<{
    id?: string;                        // Existing subtransaction ID (for updates)
    amount: number;                     // Required: Amount in milliunits
    category_id?: string | null;
    payee_id?: string | null;
    payee_name?: string;
    memo?: string;
    transfer_account_id?: string | null;
    delete?: boolean;                   // Set to true to delete this split
  }>;
}
```

**Response:**
```typescript
{
  transaction: {
    id: string;
    subtransactions: Array<{
      id: string;
      amount: {
        milliunits: number;
        formatted: string;
      };
      category_id: string | null;
      category_name: string | null;
      payee_id: string | null;
      payee_name: string | null;
      memo: string | null;
      deleted: boolean;
    }>;
  };
  changes: {
    added_splits: number;
    updated_splits: number;
    deleted_splits: number;
  };
  validation: {
    splits_sum_correct: boolean;
    total_active_splits: number;
  };
}
```

---

## Category & Budget Management

### `ynab_get_categories`

Get category groups and categories for a budget. Response is trimmed by default to keep payloads small: only active categories are included, goal metadata and deleted groups/categories are always omitted, and empty groups are dropped.

**Parameters:**
```typescript
{
  budget_id: string;                    // Required: Budget ID
  category_filter?:                     // Default: 'active'
    | 'active'          // budgeted/activity/balance non-zero
    | 'with_activity'   // activity non-zero
    | 'with_balance'    // balance non-zero
    | 'all';            // every non-deleted category (including zero-balance)
  last_knowledge_of_server?: number;    // For delta sync
}
```

**Response:**
```typescript
{
  category_groups: Array<{
    id: string;
    name: string;
    hidden: boolean;
    categories: Array<{
      id: string;
      category_group_id: string;
      category_group_name: string;
      name: string;
      hidden: boolean;
      budgeted: { milliunits: number; formatted: string };  // Current month
      activity: { milliunits: number; formatted: string };  // Current month
      balance: { milliunits: number; formatted: string };   // Current balance
      note?: string;                                        // Only present when non-empty
    }>;
  }>;
  server_knowledge: number;
}
```

**Notes:**
- Goal fields (`goal_type`, `goal_target`, `goal_percentage_complete`, etc.) are never returned. Use `ynab_get_category` when goal metadata is needed for a specific category.
- `deleted` groups and categories are always excluded, regardless of `category_filter`.
- Groups with zero matching categories after filtering are omitted from the response.
- Default `'active'` is tuned for the common "show me what's configured" use. Use `'all'` for full dumps or diffing against external data.
- **Delta sync safety:** When `last_knowledge_of_server` is set and `category_filter` is omitted, the filter is forced to `'all'`. Under delta sync, any filter that rejects zero-valued categories would silently drop categories that just changed to zero — the caller would then advance `server_knowledge` past those changes and never see them. Pass an explicit `category_filter` to override this if you've accepted the risk.

---

### `ynab_get_category`

Get detailed information about a specific category.

**Parameters:**
```typescript
{
  budget_id: string;                    // Required: Budget ID
  category_id: string;                  // Required: Category ID
  include_history?: boolean;            // Include historical budget data
  history_months?: number;              // Number of months of history (default: 12)
}
```

**Response:**
```typescript
{
  category: {
    id: string;
    name: string;
    category_group_id: string;
    category_group_name: string;
    hidden: boolean;
    note: string | null;
    budgeted: number;
    activity: number;
    balance: number;
    goal_type: string | null;
    goal_target: number | null;
    goal_target_month: string | null;
    goal_percentage_complete: number | null;
    goal_months_to_budget: number | null;
    goal_under_funded: number | null;
    deleted: boolean;
  };
  history?: Array<{
    month: string;
    budgeted: {
      milliunits: number;
      formatted: string;
    };
    activity: {
      milliunits: number;
      formatted: string;
    };
    balance: {
      milliunits: number;
      formatted: string;
    };
  }>;
  goal_analysis?: {
    is_on_track: boolean;
    monthly_funding_needed: {
      milliunits: number;
      formatted: string;
    };
    projected_completion: string | null;
  };
}
```

---

### `ynab_update_category_budget`

Update the budgeted amount for a category in a specific month.

**Parameters:**
```typescript
{
  budget_id: string;                    // Required: Budget ID
  month: string;                        // Required: YYYY-MM-DD (first day of month)
  category_id: string;                  // Required: Category ID
  budgeted: number;                     // Required: Amount in milliunits
}
```

**Response:**
```typescript
{
  category: {
    id: string;
    name: string;
    budgeted: {
      milliunits: number;
      formatted: string;
    };
    activity: {
      milliunits: number;
      formatted: string;
    };
    balance: {
      milliunits: number;
      formatted: string;
    };
  };
  month: {
    month: string;
    to_be_budgeted: {
      milliunits: number;
      formatted: string;
    };
  };
  change: {
    previous_budgeted: {
      milliunits: number;
      formatted: string;
    };
    difference: {
      milliunits: number;
      formatted: string;
    };
  };
}
```

---

## Budgeting Automation

Tools that mutate `budgeted` amounts across many categories in one call. All seven share a common input schema and response shape; the per-tool sections below document only what's distinctive.

### Shared input

```typescript
interface BaseBudgetingInput {
  budget_id: string;                      // Required
  month: string;                          // Required: YYYY-MM-01
  include_categories?: string[];          // Restrict to these (by id or case-insensitive name)
  exclude_categories?: string[];          // Skip these (by id or case-insensitive name)
  skip_closed_cc_categories?: boolean;    // Default: true
  skip_hidden?: boolean;                  // Default: true
  dry_run?: boolean;                      // Default: false — plan without PATCHing
}
```

### Shared response (`BudgetingResult`)

```typescript
{
  phase: string;                          // Tool-specific identifier
  dry_run: boolean;
  categories_touched: number;
  total_moved_milliunits: number;
  to_be_budgeted_before: { milliunits: number; formatted: string };
  to_be_budgeted_after: { milliunits: number; formatted: string } | null;  // null on dry_run
  skipped_count: number;
  skipped_by_reason: Record<string, number>;  // e.g. { hidden: 36, ready_to_assign: 3 }
  details: Array<{
    category_id: string;
    category_name: string;
    previous_budgeted: number;
    new_budgeted: number;
    delta: number;
    status: 'applied' | 'planned' | 'skipped_noop' | 'failed';
    error?: string;
  }>;
  failed: Array<{ category_id: string; category_name: string; error: string }>;
}
```

**Skip reasons** (`skipped_by_reason` keys): `excluded`, `not_included`, `hidden`, `deleted`, `ready_to_assign`, `closed_cc`, `goal_carryover`, `goal`, `no_prior_month` (assign-same-as-last-month only), `no_history` (assign-average-spend only).

### `ynab_auto_sweep_positives`

Sweeps positive activity (refunds, reimbursements, interest) back to Ready-to-Assign by reducing `budgeted` by `activity`. Preserves savings: categories with a goal *and* a positive prior-month carryover are skipped (`skipped_by_reason.goal_carryover`).

**Parameters:** `BaseBudgetingInput` (no extras). **Phase:** `sweep_positives`.

### `ynab_auto_reduce_overfunded`

Frees money stuck in over-funded categories — the counterpart to sweep. Reduces `budgeted` so excess above prior-month carryover returns to Ready-to-Assign. Never drives `budgeted` below zero. Skips *every* category with a goal (`skipped_by_reason.goal`).

**Parameters:** `BaseBudgetingInput` (no extras). **Phase:** `reduce_overfunded`.

### `ynab_auto_assign_underfunded`

Mirrors YNAB's "Auto-Assign: Underfunded" button. Funds every category with a negative month-balance to exactly $0.

**Parameters:** `BaseBudgetingInput` (no extras). **Phase:** `assign_underfunded`.

### `ynab_auto_balance_month`

Composes sweep-positives → reduce-overfunded → assign-underfunded in one call. Loads accounts + month once; reuses the account list across phases (saves rate-limit budget).

**Parameters:**
```typescript
BaseBudgetingInput & {
  reduce_overfunded?: boolean;   // Default: true. Set false to skip the middle phase.
}
```

**Response:** different from the shared shape — aggregates sub-phase results.
```typescript
{
  phase: 'balance_month';
  dry_run: boolean;
  phases: BudgetingResult[];     // Sweep, (reduce), assign in order
  total_moved_milliunits: number;
}
```

**Note:** in `dry_run`, each phase's planned changes are simulated forward so the same category doesn't appear in multiple phases' details.

### `ynab_assign_same_as_last_month`

For each filtered category, copies the previous month's `budgeted` amount. Categories absent from the prior month are skipped (`skipped_by_reason.no_prior_month`).

**Parameters:** `BaseBudgetingInput` (no extras). **Phase:** `assign_same_as_last_month`.

### `ynab_assign_average_spend`

Assigns each category an amount equal to its rolling average *outflow* over recent months. Positive activity (refunds) is ignored so the average reflects real spending. Categories with no outflow history in the window are skipped (`skipped_by_reason.no_history`).

**Parameters:**
```typescript
BaseBudgetingInput & {
  lookback_months?: number;   // Default: 3, range 1–12
}
```

**Response:** `BudgetingResult` plus `lookback_used: number` (the actual max window observed; may be less than requested if a category is newer than `lookback_months`). **Phase:** `assign_average_spend`.

### `ynab_reset_available_amounts`

Mirrors YNAB's "Reset Available Amounts": sets every filtered category's balance to exactly $0 for the month by adjusting `budgeted` by `-balance`. Positive balances flow back to Ready-to-Assign; negative balances are covered from it.

**Parameters:** `BaseBudgetingInput` (no extras). **Phase:** `reset_available_amounts`.

---

## Payee Management

### `ynab_get_payees`

Get all payees for a budget.

**Parameters:**
```typescript
{
  budget_id: string;                    // Required: Budget ID
  last_knowledge_of_server?: number;   // For delta sync
  include_deleted?: boolean;            // Include deleted payees (default: false)
}
```

**Response:**
```typescript
{
  payees: Array<{
    id: string;
    name: string;
    transfer_account_id: string | null; // If this is a transfer payee
    deleted: boolean;
  }>;
  server_knowledge: number;
}
```

---

### `ynab_get_payee`

Get detailed information about a specific payee.

**Parameters:**
```typescript
{
  budget_id: string;                    // Required: Budget ID
  payee_id: string;                     // Required: Payee ID
  include_transactions?: boolean;       // Include recent transactions
  transaction_limit?: number;           // Limit for recent transactions (default: 10)
}
```

**Response:**
```typescript
{
  payee: {
    id: string;
    name: string;
    transfer_account_id: string | null;
    deleted: boolean;
  };
  transactions?: Array<{
    id: string;
    date: string;
    amount: {
      milliunits: number;
      formatted: string;
    };
    memo: string | null;
    account_name: string;
    category_name: string | null;
  }>;
  statistics?: {
    total_transactions: number;
    average_amount: {
      milliunits: number;
      formatted: string;
    };
    total_spent: {
      milliunits: number;
      formatted: string;
    };
    most_common_category: string | null;
  };
}
```

---

### `ynab_create_payee`

Create a new payee.

**Parameters:**
```typescript
{
  budget_id: string;                    // Required: Budget ID
  name: string;                         // Required: Payee name
}
```

**Response:**
```typescript
{
  payee: {
    id: string;
    name: string;
    transfer_account_id: null;
    deleted: false;
  };
}
```

---

## Scheduled Transactions

### `ynab_get_scheduled_transactions`

Get all scheduled transactions for a budget.

**Parameters:**
```typescript
{
  budget_id: string;                    // Required: Budget ID
  last_knowledge_of_server?: number;   // For delta sync
  include_deleted?: boolean;            // Include deleted scheduled transactions
}
```

**Response:**
```typescript
{
  scheduled_transactions: Array<{
    id: string;
    date_first: string;                 // YYYY-MM-DD
    frequency: 'never' | 'daily' | 'weekly' | 'everyOtherWeek' | 'twiceAMonth' | 'monthly' | 'everyOtherMonth' | 'everyThreeMonths' | 'everyFourMonths' | 'twiceAYear' | 'yearly';
    amount: number;                     // In milliunits
    memo: string | null;
    payee_id: string | null;
    payee_name: string | null;
    account_id: string;
    account_name: string;
    category_id: string | null;
    category_name: string | null;
    transfer_account_id: string | null;
    flag_color: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | null;
    deleted: boolean;
  }>;
  server_knowledge: number;
}
```

**Frequency Values:**
- `never` - One-time transaction
- `daily` - Every day
- `weekly` - Every week
- `everyOtherWeek` - Every other week
- `twiceAMonth` - Twice per month
- `monthly` - Every month
- `everyOtherMonth` - Every other month
- `everyThreeMonths` - Every three months (quarterly)
- `everyFourMonths` - Every four months
- `twiceAYear` - Twice per year
- `yearly` - Once per year

---

### `ynab_get_scheduled_transaction`

Get detailed information about a specific scheduled transaction.

**Parameters:**
```typescript
{
  budget_id: string;                    // Required: Budget ID
  scheduled_transaction_id: string;     // Required: Scheduled transaction ID
}
```

**Response:**
```typescript
{
  scheduled_transaction: {
    id: string;
    date_first: string;
    frequency: string;
    amount: {
      milliunits: number;
      formatted: string;
    };
    memo: string | null;
    payee_id: string | null;
    payee_name: string | null;
    account_id: string;
    account_name: string;
    category_id: string | null;
    category_name: string | null;
    transfer_account_id: string | null;
    flag_color: string | null;
    deleted: boolean;
  };
  upcoming_dates: string[];             // Next few scheduled dates
}
```

---

### `ynab_create_scheduled_transaction`

Create a new scheduled transaction.

**Parameters:**
```typescript
{
  budget_id: string;                    // Required: Budget ID
  account_id: string;                   // Required: Account ID
  payee_id?: string | null;
  payee_name?: string;                  // Creates payee if doesn't exist
  category_id?: string | null;
  amount: number;                       // Required: Amount in milliunits
  memo?: string;
  frequency: string;                    // Required: Frequency (see values above)
  date_first: string;                   // Required: First occurrence (YYYY-MM-DD)
  flag_color?: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | null;
}
```

**Response:**
```typescript
{
  scheduled_transaction: {
    id: string;
    date_first: string;
    frequency: string;
    amount: {
      milliunits: number;
      formatted: string;
    };
    memo: string | null;
    payee_id: string | null;
    payee_name: string | null;
    account_id: string;
    account_name: string;
    category_id: string | null;
    category_name: string | null;
    flag_color: string | null;
  };
  upcoming_dates: string[];
  payee_created?: {
    id: string;
    name: string;
  };
}
```

---

### `ynab_update_scheduled_transaction`

Update an existing scheduled transaction.

**Parameters:**
```typescript
{
  budget_id: string;                    // Required: Budget ID
  scheduled_transaction_id: string;     // Required: Scheduled transaction ID
  account_id?: string;
  payee_id?: string | null;
  payee_name?: string;
  category_id?: string | null;
  amount?: number;                      // Amount in milliunits
  memo?: string;
  frequency?: string;
  date_first?: string;                  // YYYY-MM-DD
  flag_color?: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | null;
}
```

**Response:**
```typescript
{
  scheduled_transaction: {
    id: string;
    // ... updated scheduled transaction data
  };
  changes_made: string[];               // List of fields changed
  upcoming_dates: string[];
  payee_created?: {
    id: string;
    name: string;
  };
}
```

---

### `ynab_delete_scheduled_transaction`

Delete a scheduled transaction.

**Parameters:**
```typescript
{
  budget_id: string;                    // Required: Budget ID
  scheduled_transaction_id: string;     // Required: Scheduled transaction ID
}
```

**Response:**
```typescript
{
  deleted_scheduled_transaction: {
    id: string;
    deleted: true;
  };
  success: boolean;
}
```

---

## Transfer Management

### `ynab_create_transfer`

Create a new transfer between two accounts. This creates both outflow and inflow transactions automatically linked together.

**WARNING:** This tool always creates NEW transactions. It does NOT link existing transactions. If a matching transaction already exists, this will create a duplicate.

**Parameters:**
```typescript
{
  budget_id: string;                    // Required: Budget ID
  from_account_id: string;              // Required: Account to transfer FROM
  to_account_id: string;                // Required: Account to transfer TO
  amount: number;                       // Required: Amount in milliunits (positive value)
  date: string;                         // Required: Date in YYYY-MM-DD format
  memo?: string;                        // Optional memo
}
```

**Response:**
```typescript
{
  transfer_transaction: {
    id: string;
    date: string;
    amount: {
      milliunits: number;
      formatted: string;
    };
    memo: string | null;
    payee: {
      id: string | null;
      name: string | null;
    };
    account: {
      id: string;
      name: string;
    };
    transfer: {
      account_id: string;
      transaction_id: string | null;
    };
    cleared: string;
    approved: boolean;
  };
  server_knowledge: number;
}
```

---

### `ynab_unlink_transfer`

Remove the transfer link between two transactions.

**Parameters:**
```typescript
{
  budget_id: string;                    // Required: Budget ID
  transaction_id: string;               // Required: Either transaction ID in the transfer
}
```

**Response:**
```typescript
{
  unlinked_transactions: Array<{
    id: string;
    account_id: string;
    transfer_account_id: null;
    transfer_transaction_id: null;
  }>;
  success: boolean;
}
```

---

## Import Tools

### `ynab_import_transactions`

Import multiple transactions from external sources with validation.

**Parameters:**
```typescript
{
  budget_id: string;                    // Required: Budget ID
  transactions: Array<{
    account_id: string;                 // Required: Target account ID
    payee_name?: string;
    category_id?: string | null;
    amount: number;                     // Required: Amount in milliunits
    memo?: string;
    date: string;                       // Required: YYYY-MM-DD
    cleared?: 'cleared' | 'uncleared' | 'reconciled';
    approved?: boolean;
    flag_color?: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | null;
    import_id: string;                  // Required: Unique identifier for deduplication
  }>;
  duplicate_handling?: 'skip' | 'update' | 'error'; // Default: 'skip'
  create_payees?: boolean;              // Auto-create missing payees (default: true)
  validate_accounts?: boolean;          // Validate account IDs exist (default: true)
  validate_categories?: boolean;        // Validate category IDs exist (default: true)
}
```

**Response:**
```typescript
{
  import_result: {
    total_transactions: number;
    successful_imports: number;
    skipped_duplicates: number;
    failed_imports: number;
    created_payees: number;
  };
  successful_transactions: Array<{
    import_id: string;
    transaction_id: string;
    amount: {
      milliunits: number;
      formatted: string;
    };
    payee_name: string | null;
    account_name: string;
  }>;
  failed_transactions: Array<{
    import_id: string;
    error: string;
    details?: any;
  }>;
  duplicate_transactions: Array<{
    import_id: string;
    existing_transaction_id: string;
    action_taken: 'skipped' | 'updated';
  }>;
  created_payees: Array<{
    id: string;
    name: string;
  }>;
  validation_errors?: Array<{
    import_id: string;
    field: string;
    error: string;
  }>;
}
```

---

## Analysis & Allocation

### `ynab_recommend_category_allocation`

Get budget allocation recommendations based on spending patterns and goals.

**Parameters:**
```typescript
{
  budget_id: string;                    // Required: Budget ID
  strategy?: 'proportional' | 'goals_first' | 'essential_first' | 'balanced'; // Default: 'balanced'
  analysis_months?: number;             // Months to analyze (1-24, default: 12)
  available_funds?: number;             // Available funds in milliunits
  emergency_fund_target?: number;       // Emergency fund target in milliunits
  category_ids?: string[];              // Specific categories to analyze
  include_hidden?: boolean;             // Include hidden categories (default: false)
}
```

**Response:**
```typescript
{
  recommendations: Array<{
    category_id: string;
    category_name: string;
    current_budgeted: {
      milliunits: number;
      formatted: string;
    };
    recommended_amount: {
      milliunits: number;
      formatted: string;
    };
    allocation_difference: {
      milliunits: number;
      formatted: string;
      percentage_change: number;
    };
    priority: 'emergency' | 'essential' | 'important' | 'discretionary';
    confidence: number;                 // 0-100 confidence score
    reasoning: string[];                // Array of reasoning explanations
    goal_info?: {
      goal_type: string;
      goal_target: {
        milliunits: number;
        formatted: string;
      };
      goal_target_month: string | null;
      monthly_funding_needed: {
        milliunits: number;
        formatted: string;
      };
      progress_percentage: number;
    };
    spending_pattern?: {
      monthly_average: {
        milliunits: number;
        formatted: string;
      };
      predictability_score: number;     // 0-100 how predictable spending is
      trend: 'increasing' | 'stable' | 'decreasing';
    };
  }>;
  summary: {
    strategy_used: string;
    total_categories_analyzed: number;
    analysis_period: {
      months: number;
      start_date: string;
      end_date: string;
    };
    total_current_budgeted: {
      milliunits: number;
      formatted: string;
    };
    total_recommended: {
      milliunits: number;
      formatted: string;
    };
    net_change: {
      milliunits: number;
      formatted: string;
    };
    priority_breakdown: {
      emergency: number;
      essential: number;
      important: number;
      discretionary: number;
    };
    average_confidence: number;
  };
  available_funds?: {
    provided: {
      milliunits: number;
      formatted: string;
    };
    after_recommendations: {
      milliunits: number;
      formatted: string;
    };
  };
}
```

**Allocation Strategies:**
- `proportional` - Allocate based on historical spending proportions
- `goals_first` - Prioritize categories with specific goals
- `essential_first` - Prioritize essential categories before discretionary
- `balanced` - Balance between goals, essentials, and spending patterns

---

### `ynab_analyze_spending_patterns`

Perform comprehensive analysis of spending patterns to identify trends and opportunities.

**Parameters:**
```typescript
{
  budget_id: string;                    // Required: Budget ID
  analysis_months?: number;             // Months to analyze (1-24, default: 12)
  category_ids?: string[];              // Specific categories to analyze
  payee_ids?: string[];                 // Specific payees to analyze
  account_ids?: string[];               // Specific accounts to analyze
  include_forecasting?: boolean;        // Include spending forecasts (default: false)
  include_anomaly_detection?: boolean;  // Detect unusual spending (default: true)
  include_seasonal_analysis?: boolean;  // Analyze seasonal patterns (default: false)
  grouping?: 'category' | 'payee' | 'account' | 'month'; // Primary grouping (default: 'category')
}
```

**Response:**
```typescript
{
  analysis_period: {
    start_date: string;
    end_date: string;
    total_months: number;
  };
  spending_summary: {
    total_outflow: {
      milliunits: number;
      formatted: string;
    };
    average_monthly: {
      milliunits: number;
      formatted: string;
    };
    total_transactions: number;
    unique_payees: number;
    active_categories: number;
  };
  category_analysis: Array<{
    category_id: string;
    category_name: string;
    total_spent: {
      milliunits: number;
      formatted: string;
    };
    percentage_of_total: number;
    monthly_average: {
      milliunits: number;
      formatted: string;
    };
    transaction_count: number;
    predictability_score: number;       // 0-100 how consistent spending is
    trend: 'increasing' | 'stable' | 'decreasing';
    trend_percentage: number;           // Rate of change
    largest_expense: {
      amount: {
        milliunits: number;
        formatted: string;
      };
      date: string;
      payee_name: string | null;
      memo: string | null;
    };
    anomalies?: Array<{
      date: string;
      amount: {
        milliunits: number;
        formatted: string;
      };
      deviation_score: number;          // How unusual this transaction was
      payee_name: string | null;
      memo: string | null;
    }>;
  }>;
  top_payees: Array<{
    payee_id: string;
    payee_name: string;
    total_spent: {
      milliunits: number;
      formatted: string;
    };
    transaction_count: number;
    average_transaction: {
      milliunits: number;
      formatted: string;
    };
    most_common_category: string;
    frequency: 'high' | 'medium' | 'low'; // Based on transaction frequency
  }>;
  monthly_trends: Array<{
    month: string;
    total_spending: {
      milliunits: number;
      formatted: string;
    };
    transaction_count: number;
    average_transaction_size: {
      milliunits: number;
      formatted: string;
    };
    top_categories: Array<{
      category_name: string;
      amount: {
        milliunits: number;
        formatted: string;
      };
    }>;
  }>;
  insights: Array<{
    type: 'trend' | 'anomaly' | 'opportunity' | 'warning';
    title: string;
    description: string;
    impact: 'high' | 'medium' | 'low';
    categories_affected?: string[];
    potential_savings?: {
      milliunits: number;
      formatted: string;
    };
    recommendation?: string;
  }>;
  forecasting?: {
    next_month_predicted: {
      milliunits: number;
      formatted: string;
    };
    confidence: number;
    category_predictions: Array<{
      category_name: string;
      predicted_amount: {
        milliunits: number;
        formatted: string;
      };
      confidence: number;
    }>;
  };
  seasonal_patterns?: Array<{
    month_name: string;
    spending_index: number;             // Relative to average (1.0 = average)
    typical_categories: string[];       // Categories with high spending this month
  }>;
}
```

---

### `ynab_distribute_to_be_budgeted`

Distribute available "To Be Budgeted" funds across categories using configurable strategies.

**Parameters:**
```typescript
{
  budget_id: string;                    // Required: Budget ID
  month?: string;                       // Month to budget for (YYYY-MM-DD, default: current)
  distribution_strategy?: 'goals_first' | 'proportional' | 'essential_first' | 'custom'; // Default: 'goals_first'
  max_amount?: number;                  // Max amount to distribute in milliunits
  priority_categories?: string[];       // Category IDs to prioritize
  exclude_categories?: string[];        // Category IDs to exclude
  emergency_fund_priority?: boolean;    // Prioritize emergency fund categories
  debt_payoff_priority?: boolean;       // Prioritize debt categories
}
```

**Response:**
```typescript
{
  distribution: {
    month: string;
    available_to_budget: {
      milliunits: number;
      formatted: string;
    };
    amount_distributed: {
      milliunits: number;
      formatted: string;
    };
    remaining_to_budget: {
      milliunits: number;
      formatted: string;
    };
  };
  allocations: Array<{
    category_id: string;
    category_name: string;
    previous_budgeted: {
      milliunits: number;
      formatted: string;
    };
    allocated_amount: {
      milliunits: number;
      formatted: string;
    };
    new_total_budgeted: {
      milliunits: number;
      formatted: string;
    };
    allocation_reason: string;
    priority: 'emergency' | 'essential' | 'goal' | 'proportional';
    goal_progress?: {
      previous_progress: number;
      new_progress: number;
      fully_funded: boolean;
    };
  }>;
  strategy_summary: {
    strategy_used: string;
    categories_funded: number;
    goals_fully_funded: number;
    goals_partially_funded: number;
    total_goal_funding: {
      milliunits: number;
      formatted: string;
    };
    proportional_funding: {
      milliunits: number;
      formatted: string;
    };
  };
  recommendations: Array<{
    type: 'warning' | 'suggestion' | 'success';
    message: string;
    affected_categories?: string[];
  }>;
}
```

---

## Common Patterns

### Date Formats

All dates in YNAB use the `YYYY-MM-DD` format:
- `2024-01-15` - January 15, 2024
- `2024-12-31` - December 31, 2024

### Amount Handling

All monetary amounts in YNAB are in **milliunits** (multiply dollars by 1000):
- `$1.00` = `1000` milliunits
- `$-45.67` = `-45670` milliunits
- `$0.01` = `10` milliunits

**Converting from dollars:**
```javascript
const dollars = 45.67;
const milliunits = Math.round(dollars * 1000); // 45670
```

**Converting to dollars:**
```javascript
const milliunits = 45670;
const dollars = milliunits / 1000; // 45.67
```

### Delta Sync

Many tools support delta sync using `last_knowledge_of_server`:
```json
{
  "budget_id": "xxx",
  "last_knowledge_of_server": 12345
}
```

Use the `server_knowledge` value from the previous response as `last_knowledge_of_server` in subsequent requests to get only changed data.

### Pagination

For tools that return large datasets, use `limit` parameter:
```json
{
  "budget_id": "xxx",
  "limit": 100
}
```

Maximum limits vary by endpoint, typically 1000 for transactions.

---

## Error Handling

### Common Error Types

**Authentication Errors (401):**
```json
{
  "error": "Invalid or expired YNAB API token"
}
```

**Rate Limit Errors (429):**
```json
{
  "error": "Rate limit exceeded. Try again later.",
  "retry_after": 3600
}
```

**Not Found Errors (404):**
```json
{
  "error": "Budget not found",
  "budget_id": "invalid-id"
}
```

**Validation Errors (400):**
```json
{
  "error": "Invalid input parameters",
  "details": {
    "amount": "Amount must be an integer",
    "date": "Date must be in YYYY-MM-DD format"
  }
}
```

### Error Recovery

The server implements automatic retry for:
- Network connectivity issues
- Temporary YNAB API errors (5xx)
- Rate limit errors (with exponential backoff)

For client code, implement error handling:
```javascript
try {
  const result = await ynab_tool(params);
  return result;
} catch (error) {
  if (error.code === 'RATE_LIMIT') {
    // Wait and retry
    await new Promise(resolve => setTimeout(resolve, error.retry_after * 1000));
    return await ynab_tool(params);
  } else if (error.code === 'NOT_FOUND') {
    // Handle missing resource
    console.log(`Resource not found: ${error.details}`);
    return null;
  }
  throw error; // Re-throw unexpected errors
}
```

---

This concludes the comprehensive tool reference for the YNAB MCP Server. Each tool provides detailed error messages and follows consistent patterns for parameters and responses.