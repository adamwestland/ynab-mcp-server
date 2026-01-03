import { z } from 'zod';

// Base tool interface for MCP tools
export interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  execute(args: unknown): Promise<unknown>;
}

// YNAB API Types
export interface YnabAccount {
  id: string;
  name: string;
  type: string;
  on_budget: boolean;
  closed: boolean;
  note: string | null;
  balance: number;
  cleared_balance: number;
  uncleared_balance: number;
  transfer_payee_id: string;
  direct_import_linked: boolean;
  direct_import_in_error: boolean;
  last_reconciled_at: string | null;
  debt_original_balance: number | null;
  debt_interest_rates: Record<string, number> | null;
  debt_minimum_payments: Record<string, number> | null;
  debt_escrow_amounts: Record<string, number> | null;
}

export interface YnabSubTransaction {
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
}

export interface YnabTransaction {
  id: string;
  date: string;
  amount: number;
  memo: string | null;
  payee_name: string | null;
  payee_id: string | null;
  category_id: string | null;
  category_name: string | null;
  account_id: string;
  account_name: string;
  transfer_account_id: string | null;
  transfer_transaction_id: string | null;
  matched_transaction_id: string | null;
  import_id: string | null;
  import_payee_name: string | null;
  import_payee_name_original: string | null;
  debt_transaction_type: string | null;
  cleared: string;
  approved: boolean;
  flag_color: string | null;
  flag_name: string | null;
  subtransactions?: YnabSubTransaction[];
}

export interface YnabCategory {
  id: string;
  name: string;
  category_group_id: string;
  category_group_name: string;
  budgeted: number;
  activity: number;
  balance: number;
  goal_type: string | null;
  goal_day: number | null;
  goal_cadence: number | null;
  goal_cadence_frequency: number | null;
  goal_creation_month: string | null;
  goal_target: number | null;
  goal_target_month: string | null;
  goal_percentage_complete: number | null;
  goal_months_to_budget: number | null;
  goal_under_funded: number | null;
  goal_overall_funded: number | null;
  goal_overall_left: number | null;
  note: string | null;
  hidden: boolean;
  original_category_group_id: string | null;
  deleted: boolean;
}

export interface YnabBudget {
  id: string;
  name: string;
  last_modified_on: string;
  first_month: string;
  last_month: string;
  date_format: {
    format: string;
  };
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
}

export interface YnabPayee {
  id: string;
  name: string;
  transfer_account_id: string | null;
  transfer_account_name: string | null;
  deleted: boolean;
}

export interface YnabScheduledSubTransaction {
  id: string;
  scheduled_transaction_id: string;
  amount: number;
  memo: string | null;
  payee_id: string | null;
  category_id: string | null;
  transfer_account_id: string | null;
}

export interface YnabScheduledTransaction {
  id: string;
  date_first: string;
  frequency: 'never' | 'daily' | 'weekly' | 'everyOtherWeek' | 'twiceAMonth' | 'monthly' | 
            'everyOtherMonth' | 'everyThreeMonths' | 'everyFourMonths' | 'twiceAYear' | 
            'yearly' | 'everyOtherYear';
  amount: number;
  memo: string | null;
  payee_id: string | null;
  payee_name: string | null;
  category_id: string | null;
  category_name: string | null;
  transfer_account_id: string | null;
  account_id: string;
  account_name: string;
  flag_color: string | null;
  flag_name: string | null;
  date_last: string | null;
  date_next: string | null;
  completed_transactions: number;
  upcoming_transactions: YnabTransaction[] | null;
  subtransactions?: YnabScheduledSubTransaction[];
}

// API Response Types
export interface YnabApiResponse<T> {
  data: T;
}

export interface YnabBudgetsResponse {
  budgets: YnabBudget[];
  default_budget: YnabBudget | null;
}

export interface YnabAccountsResponse {
  accounts: YnabAccount[];
  server_knowledge: number;
}

export interface YnabTransactionsResponse {
  transactions: YnabTransaction[];
  server_knowledge: number;
}

export interface YnabCategoriesResponse {
  category_groups: Array<{
    id: string;
    name: string;
    hidden: boolean;
    deleted: boolean;
    categories: YnabCategory[];
  }>;
  server_knowledge: number;
}

export interface YnabPayeesResponse {
  payees: YnabPayee[];
  server_knowledge: number;
}

export interface YnabTransactionResponse {
  transaction: YnabTransaction;
  server_knowledge: number;
}

export interface YnabCategoryResponse {
  category: YnabCategory;
  server_knowledge: number;
}

export interface YnabPayeeResponse {
  payee: YnabPayee;
  server_knowledge: number;
}

export interface YnabBudgetMonth {
  month: string;
  note: string | null;
  income: number;
  budgeted: number;
  activity: number;
  to_be_budgeted: number;
  age_of_money: number | null;
  deleted: boolean;
  categories: YnabCategory[];
}

export interface YnabBudgetMonthResponse {
  month: YnabBudgetMonth;
  server_knowledge: number;
}

export interface YnabScheduledTransactionsResponse {
  scheduled_transactions: YnabScheduledTransaction[];
  server_knowledge: number;
}

export interface YnabScheduledTransactionResponse {
  scheduled_transaction: YnabScheduledTransaction;
  server_knowledge: number;
}

// =============================================================================
// API Request Types (for creating/updating resources)
// Derived from YNAB OpenAPI spec: https://api.ynab.com/papi/open_api_spec.yaml
// =============================================================================

/** Flag colors available for transactions */
export type FlagColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | null;

/** Transaction cleared status */
export type ClearedStatus = 'cleared' | 'uncleared' | 'reconciled';

/** Scheduled transaction frequency */
export type ScheduledFrequency =
  | 'never' | 'daily' | 'weekly' | 'everyOtherWeek' | 'twiceAMonth'
  | 'every4Weeks' | 'monthly' | 'everyOtherMonth' | 'every3Months' | 'everyThreeMonths'
  | 'every4Months' | 'everyFourMonths' | 'twiceAYear' | 'yearly' | 'everyOtherYear';

/**
 * Subtransaction for split transactions (request format)
 */
export interface SaveSubTransaction {
  /** Amount in milliunits (required) */
  amount: number;
  /** Payee ID (optional) */
  payee_id?: string | null;
  /** Payee name - max 200 chars (optional) */
  payee_name?: string | null;
  /** Category ID (optional) */
  category_id?: string | null;
  /** Memo - max 500 chars (optional) */
  memo?: string | null;
  /** Transfer account ID for transfer subtransactions */
  transfer_account_id?: string | null;
}

/**
 * Subtransaction update (includes optional ID for existing subtransactions)
 */
export interface UpdateSubTransaction extends SaveSubTransaction {
  /** Subtransaction ID (include to update existing, omit for new) */
  id?: string;
}

/**
 * Transaction creation request
 */
export interface SaveTransaction {
  /** Account ID (required) */
  account_id: string;
  /** Date in ISO format YYYY-MM-DD (required) */
  date: string;
  /** Amount in milliunits (required) */
  amount: number;
  /** Payee ID */
  payee_id?: string | null;
  /** Payee name - max 200 chars. Used to resolve payee if payee_id is null */
  payee_name?: string | null;
  /** Category ID. Null for splits, use subtransactions instead */
  category_id?: string | null;
  /** Memo - max 500 chars */
  memo?: string | null;
  /** Cleared status */
  cleared?: ClearedStatus | null;
  /** Whether transaction is approved */
  approved?: boolean;
  /** Flag color */
  flag_color?: FlagColor;
  /** Import ID - max 36 chars. For deduplication of imported transactions */
  import_id?: string | null;
  /** Transfer account ID (for creating/updating transfers) */
  transfer_account_id?: string | null;
  /** Subtransactions for split transactions */
  subtransactions?: SaveSubTransaction[];
}

/**
 * Transaction update request (all fields optional for PATCH)
 */
export type UpdateTransaction = Partial<SaveTransaction>;

/**
 * Transaction update request with ID (for batch updates via PATCH /transactions)
 */
export interface UpdateTransactionWithId extends UpdateTransaction {
  /** Transaction ID (required for batch updates) */
  id: string;
}

/**
 * Scheduled transaction creation request
 */
export interface SaveScheduledTransaction {
  /** Account ID (required) */
  account_id: string;
  /** First date in ISO format YYYY-MM-DD (required, max 5 years in future) */
  date_first: string;
  /** Amount in milliunits */
  amount?: number;
  /** Payee ID */
  payee_id?: string | null;
  /** Payee name - max 200 chars */
  payee_name?: string | null;
  /** Category ID */
  category_id?: string | null;
  /** Memo - max 500 chars */
  memo?: string | null;
  /** Flag color */
  flag_color?: FlagColor;
  /** Recurrence frequency */
  frequency?: ScheduledFrequency;
  /** Transfer account ID for transfers */
  transfer_account_id?: string | null;
  /** Subtransactions for split scheduled transactions */
  subtransactions?: SaveSubTransaction[];
}

/**
 * Scheduled transaction update request (all fields optional)
 */
export type UpdateScheduledTransaction = Partial<SaveScheduledTransaction>;

/**
 * Payee creation request
 */
export interface SavePayee {
  /** Payee name - max 500 chars (required) */
  name: string;
}

/**
 * Category budget update request
 */
export interface SaveMonthCategory {
  /** Budgeted amount in milliunits (required) */
  budgeted: number;
}

// =============================================================================
// Error types
// =============================================================================

export interface YnabApiError {
  id: string;
  name: string;
  description: string;
}

export interface YnabApiErrorResponse {
  error: YnabApiError;
}

// Extended error types for better error handling
/** 
 * Categories of errors that can occur when interacting with the YNAB API
 */
export type ErrorType = 
  | 'validation'     // Invalid request parameters or data
  | 'not_found'      // Requested resource does not exist
  | 'rate_limit'     // API rate limit exceeded
  | 'auth'           // Authentication or authorization failure
  | 'api_error'      // Server-side API error
  | 'network_error'  // Network connectivity issue
  | 'timeout'        // Request timed out
  | 'unknown';       // Unclassified error

/**
 * Detailed error information for YNAB API errors
 */
export interface YNABErrorDetails {
  /** The category of error */
  type: ErrorType;
  /** Error code from the API (if available) */
  code?: string | undefined;
  /** Human-readable error message */
  message: string;
  /** Original error object that caused this error */
  originalError?: unknown;
  /** Time in milliseconds to wait before retrying (for rate limit errors) */
  retryAfter?: number | undefined;
  /** Unique identifier for the request that caused this error */
  requestId?: string | undefined;
  /** HTTP status code (if applicable) */
  statusCode?: number | undefined;
}

// Client configuration types
/**
 * Configuration for retry behavior with exponential backoff
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Initial delay in milliseconds before first retry */
  initialDelay: number;
  /** Maximum delay in milliseconds between retries */
  maxDelay: number;
  /** Multiplier for exponential backoff (delay *= backoffMultiplier) */
  backoffMultiplier: number;
  /** HTTP status codes that should trigger a retry */
  retryableStatusCodes: number[];
}

/**
 * Options for individual HTTP requests
 */
export interface RequestOptions {
  /** Request timeout in milliseconds (overrides default) */
  timeout?: number;
  /** Custom retry configuration (overrides defaults) */
  retryConfig?: Partial<RetryConfig>;
  /** Skip rate limiting for this request */
  skipRateLimit?: boolean;
  /** Additional HTTP headers to include */
  headers?: Record<string, string>;
}