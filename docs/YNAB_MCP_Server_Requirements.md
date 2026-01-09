# YNAB MCP Server Requirements Specification

## 1. Overview

### 1.1 Purpose
This document specifies the requirements for a Model Context Protocol (MCP) server that provides complete access to the YNAB (You Need A Budget) API v1. The server will enable AI assistants and other MCP clients to interact with YNAB budgets, accounts, transactions, and categories through well-defined, specific tools.

**Complete Coverage**: This specification includes 40+ tools covering:
- All core YNAB API operations (budgets, accounts, transactions, categories, payees)
- Advanced features (split transactions, transfer linking, batch operations)
- Scheduled transaction management
- Intelligent category allocation recommendations
- Spending pattern analysis
- OAuth 2.0 and direct token authentication

### 1.2 Design Principles
Following MCP best practices from the Cloudflare documentation:
- **Specific Tool Design**: Each tool performs one specific operation
- **Structured Parameters**: Clear, validated parameter schemas
- **Comprehensive Error Handling**: Structured error responses with actionable messages
- **Idempotency**: Update operations are idempotent where possible
- **Batch Support**: Critical for performance with YNAB's API limits

### 1.3 Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│ MCP Client  │────▶│  MCP Server  │────▶│  YNAB API   │
│ (Assistant) │◀────│   (Tools)    │◀────│    (v1)     │
└─────────────┘     └──────────────┘     └─────────────┘
                           │
                    ┌──────▼──────┐
                    │ Rate Limiter│
                    │  (200/hour) │
                    └─────────────┘
```

### 1.4 Authentication
- **Option 1: Direct API Token** (Recommended for simplicity)
  - Token provided via environment variable: `YNAB_API_TOKEN`
  - All requests authenticated with Bearer token
  - No token exposure to MCP clients

- **Option 2: OAuth 2.0 Flow** (For multi-user scenarios)
  - Authorization URL: `https://app.youneedabudget.com/oauth/authorize`
  - Token URL: `https://app.youneedabudget.com/oauth/token`
  - Scopes: `read`, `write`
  - Server manages token refresh automatically
  - Tokens stored securely with encryption

### 1.5 Rate Limiting
- YNAB API limit: 200 requests per hour
- Server implements token bucket algorithm
- Automatic retry with exponential backoff for 429 responses
- Rate limit status included in tool responses

### 1.6 Error Handling
All tools return structured errors:
```json
{
  "error": {
    "type": "rate_limit" | "not_found" | "validation" | "api_error",
    "message": "Human-readable error message",
    "details": {
      "status_code": 429,
      "retry_after": 1800,
      "resource_type": "transaction",
      "resource_id": "abc-123"
    }
  }
}
```

## 2. Tool Specifications

### 2.1 Budget Management Tools

#### ynab_list_budgets
**Purpose**: Retrieve all budgets accessible to the authenticated user

**Parameters**: None

**Returns**:
```typescript
{
  budgets: Array<{
    id: string           // UUID
    name: string
    last_modified_on: string  // ISO 8601
    first_month: string       // YYYY-MM-DD
    last_month: string        // YYYY-MM-DD
    currency_format: {
      iso_code: string
      example_format: string
      decimal_digits: number
      decimal_separator: string
      symbol_first: boolean
      group_separator: string
      currency_symbol: string
      display_symbol: boolean
    }
  }>
  default_budget_id?: string
}
```

**Error Conditions**:
- 401: Invalid or expired token
- 429: Rate limit exceeded

### 2.2 Account Management Tools

#### ynab_get_accounts
**Purpose**: Retrieve all accounts for a specific budget

**Parameters**:
```typescript
{
  budget_id: string  // Required: Budget UUID
  last_knowledge_of_server?: number  // Optional: For delta sync
}
```

**Returns**:
```typescript
{
  accounts: Array<{
    id: string
    name: string
    type: "checking" | "savings" | "cash" | "creditCard" | "lineOfCredit" | 
          "otherAsset" | "otherLiability" | "mortgage" | "autoLoan" | 
          "studentLoan" | "personalLoan" | "medicalDebt" | "otherDebt"
    on_budget: boolean
    closed: boolean
    balance: number           // In milliunits
    cleared_balance: number   // In milliunits
    uncleared_balance: number // In milliunits
    transfer_payee_id: string // Critical for transfers
    direct_import_linked: boolean
    deleted: boolean
  }>
  server_knowledge: number
}
```

**Error Conditions**:
- 404: Budget not found
- 401: Unauthorized

### 2.3 Transaction Read Tools

#### ynab_get_transactions
**Purpose**: Retrieve transactions with filtering options

**Parameters**:
```typescript
{
  budget_id: string           // Required
  account_id?: string         // Optional: Filter by account
  since_date?: string         // Optional: ISO date (YYYY-MM-DD)
  type?: "transaction" | "subtransaction"
  last_knowledge_of_server?: number
}
```

**Returns**:
```typescript
{
  transactions: Array<{
    id: string
    date: string              // YYYY-MM-DD
    amount: number            // Milliunits (negative for outflow)
    memo?: string
    cleared: "cleared" | "uncleared" | "reconciled"
    approved: boolean
    flag_color?: "red" | "orange" | "yellow" | "green" | "blue" | "purple"
    account_id: string
    account_name: string
    payee_id?: string
    payee_name?: string
    category_id?: string
    category_name?: string
    transfer_account_id?: string
    transfer_transaction_id?: string  // Links paired transfers
    matched_transaction_id?: string
    import_id?: string
    import_payee_name?: string
    deleted: boolean
    subtransactions: Array<{    // For split transactions
      id: string
      transaction_id: string
      amount: number
      memo?: string
      payee_id?: string
      payee_name?: string
      category_id?: string
      category_name?: string
      transfer_account_id?: string
      transfer_transaction_id?: string
      deleted: boolean
    }>
  }>
  server_knowledge: number
}
```

#### ynab_get_transaction
**Purpose**: Retrieve a single transaction by ID

**Parameters**:
```typescript
{
  budget_id: string
  transaction_id: string
}
```

**Returns**: Single transaction object (same structure as array element above)

### 2.4 Transaction Write Tools

#### ynab_create_transaction
**Purpose**: Create a new transaction

**Parameters**:
```typescript
{
  budget_id: string           // Required
  account_id: string          // Required
  date: string                // Required: YYYY-MM-DD
  amount: number              // Required: Milliunits
  payee_id?: string           // Either payee_id or payee_name
  payee_name?: string
  category_id?: string
  frequency?: string          // For recurring
  flag_color?: string
  cleared?: "cleared" | "uncleared" | "reconciled"
  approved?: boolean
  memo?: string
  import_id?: string          // For deduplication
}
```

**Returns**: Created transaction object

#### ynab_create_split_transaction
**Purpose**: Create a transaction with multiple category splits

**Parameters**:
```typescript
{
  budget_id: string
  account_id: string
  date: string
  payee_id?: string
  payee_name?: string
  cleared?: string
  approved?: boolean
  flag_color?: string
  memo?: string
  subtransactions: Array<{    // Required: At least 2
    amount: number            // Must sum to parent amount
    payee_id?: string
    payee_name?: string
    category_id?: string
    memo?: string
  }>
}
```

**Returns**: Created transaction with subtransactions

#### ynab_update_transaction
**Purpose**: Update an existing transaction

**Parameters**:
```typescript
{
  budget_id: string
  transaction_id: string
  // All fields optional - only send what needs updating
  account_id?: string
  date?: string
  amount?: number
  payee_id?: string
  payee_name?: string
  category_id?: string
  cleared?: string
  approved?: boolean
  flag_color?: string | null
  memo?: string
}
```

**Returns**: Updated transaction object

#### ynab_batch_update_transactions
**Purpose**: Update multiple transactions in a single request

**Parameters**:
```typescript
{
  budget_id: string
  transactions: Array<{       // Max 100 per request
    id: string                // Required for each
    // Optional update fields
    account_id?: string
    date?: string
    amount?: number
    payee_id?: string
    payee_name?: string
    category_id?: string
    cleared?: string
    approved?: boolean
    flag_color?: string | null
    memo?: string
  }>
}
```

**Returns**:
```typescript
{
  transactions: Array<Transaction>  // Updated transactions
  duplicate_import_ids: Array<string>
  server_knowledge: number
}
```

#### ynab_update_transaction_splits
**Purpose**: Convert a regular transaction to split or update existing splits

**Parameters**:
```typescript
{
  budget_id: string
  transaction_id: string
  subtransactions: Array<{
    id?: string               // For updating existing split
    amount: number
    payee_id?: string
    payee_name?: string
    category_id?: string
    memo?: string
  }>
}
```

**Returns**: Updated transaction with subtransactions

#### ynab_delete_transaction
**Purpose**: Delete a transaction

**Parameters**:
```typescript
{
  budget_id: string
  transaction_id: string
}
```

**Returns**: Deleted transaction object

#### ynab_import_transactions
**Purpose**: Import multiple transactions with duplicate detection

**Parameters**:
```typescript
{
  budget_id: string
  transactions: Array<{
    account_id: string
    date: string
    amount: number
    payee_id?: string
    payee_name?: string
    category_id?: string
    cleared?: string
    approved?: boolean
    memo?: string
    import_id: string         // Required for deduplication
  }>
}
```

**Returns**:
```typescript
{
  transaction_ids: Array<string>
  duplicate_import_ids: Array<string>
  transactions: Array<Transaction>
}
```

### 2.5 Transfer Tools

#### ynab_create_transfer
**Purpose**: Create a NEW linked transfer between two accounts

**Parameters**:
```typescript
{
  budget_id: string
  from_account_id: string     // Source account
  to_account_id: string       // Destination account
  amount: number              // Amount in milliunits (positive)
  date: string                // YYYY-MM-DD format
  memo?: string               // Optional memo
}
```

**Returns**: Created transfer transaction with link info

**Notes**:
- YNAB automatically creates the matching inflow transaction
- WARNING: Always creates NEW transactions - does NOT link existing ones
- If matching transactions already exist, this creates duplicates

#### ynab_unlink_transfer
**Purpose**: Break a transfer link between transactions

**Parameters**:
```typescript
{
  budget_id: string
  transaction_id: string
}
```

**Returns**: Unlinked transaction

### 2.6 Category Tools

#### ynab_get_categories
**Purpose**: Retrieve all categories and category groups

**Parameters**:
```typescript
{
  budget_id: string
  last_knowledge_of_server?: number
}
```

**Returns**:
```typescript
{
  category_groups: Array<{
    id: string
    name: string
    hidden: boolean
    deleted: boolean
    categories: Array<{
      id: string
      category_group_id: string
      category_group_name: string
      name: string
      hidden: boolean
      original_category_group_id?: string
      note?: string
      budgeted: number        // Current month budget
      activity: number        // Current month activity
      balance: number         // Current month balance
      goal_type?: string
      goal_creation_month?: string
      goal_target?: number
      goal_target_month?: string
      goal_percentage_complete?: number
      deleted: boolean
    }>
  }>
  server_knowledge: number
}
```

#### ynab_get_category
**Purpose**: Retrieve a single category

**Parameters**:
```typescript
{
  budget_id: string
  category_id: string
}
```

**Returns**: Single category object

#### ynab_update_category_budget
**Purpose**: Update budgeted amount for a category in a specific month

**Parameters**:
```typescript
{
  budget_id: string
  month: string               // YYYY-MM-DD
  category_id: string
  budgeted: number           // Milliunits
}
```

**Returns**: Updated category with new budget values

### 2.7 Payee Tools

#### ynab_get_payees
**Purpose**: Retrieve all payees

**Parameters**:
```typescript
{
  budget_id: string
  last_knowledge_of_server?: number
}
```

**Returns**:
```typescript
{
  payees: Array<{
    id: string
    name: string
    transfer_account_id?: string  // If payee is a transfer
    deleted: boolean
  }>
  server_knowledge: number
}
```

#### ynab_get_payee
**Purpose**: Retrieve a single payee

**Parameters**:
```typescript
{
  budget_id: string
  payee_id: string
}
```

**Returns**: Single payee object

#### ynab_create_payee
**Purpose**: Create a new payee

**Parameters**:
```typescript
{
  budget_id: string
  name: string
}
```

**Returns**: Created payee object

### 2.8 Budget Month Tools

#### ynab_get_budget_month
**Purpose**: Retrieve budget data for a specific month

**Parameters**:
```typescript
{
  budget_id: string
  month: string               // YYYY-MM-DD
}
```

**Returns**:
```typescript
{
  month: {
    month: string
    note?: string
    income: number
    budgeted: number
    activity: number
    to_be_budgeted: number
    age_of_money?: number
    deleted: boolean
    categories: Array<{
      id: string
      category_group_id: string
      category_group_name: string
      name: string
      hidden: boolean
      note?: string
      budgeted: number
      activity: number
      balance: number
      goal_type?: string
      goal_creation_month?: string
      goal_target?: number
      goal_target_month?: string
      goal_percentage_complete?: number
      deleted: boolean
    }>
  }
}
```

### 2.9 Scheduled Transaction Tools

#### ynab_get_scheduled_transactions
**Purpose**: Retrieve all scheduled transactions for a budget

**Parameters**:
```typescript
{
  budget_id: string
  last_knowledge_of_server?: number
}
```

**Returns**:
```typescript
{
  scheduled_transactions: Array<{
    id: string
    date_first: string           // First occurrence date
    date_next: string            // Next occurrence date  
    frequency?: string           // "never", "daily", "weekly", "everyOtherWeek", 
                                // "twiceAMonth", "every4Weeks", "monthly", "everyOtherMonth"
    amount: number               // Milliunits
    memo?: string
    flag_color?: string
    account_id: string
    payee_id?: string
    category_id?: string
    transfer_account_id?: string
    deleted: boolean
    subtransactions?: Array<{
      id: string
      scheduled_transaction_id: string
      amount: number
      memo?: string
      payee_id?: string
      category_id?: string
      transfer_account_id?: string
      deleted: boolean
    }>
  }>
  server_knowledge: number
}
```

#### ynab_get_scheduled_transaction
**Purpose**: Retrieve a single scheduled transaction

**Parameters**:
```typescript
{
  budget_id: string
  scheduled_transaction_id: string
}
```

**Returns**: Single scheduled transaction object

#### ynab_create_scheduled_transaction
**Purpose**: Create a new scheduled transaction

**Parameters**:
```typescript
{
  budget_id: string
  account_id: string
  payee_id?: string
  category_id?: string
  frequency: string              // Required
  amount: number                 // Required
  memo?: string
  flag_color?: string
  date_first: string            // Required: First occurrence
}
```

**Returns**: Created scheduled transaction

#### ynab_update_scheduled_transaction
**Purpose**: Update an existing scheduled transaction

**Parameters**:
```typescript
{
  budget_id: string
  scheduled_transaction_id: string
  account_id?: string
  payee_id?: string
  category_id?: string
  frequency?: string
  amount?: number
  memo?: string
  flag_color?: string
  date_first?: string
}
```

**Returns**: Updated scheduled transaction

#### ynab_delete_scheduled_transaction
**Purpose**: Delete a scheduled transaction

**Parameters**:
```typescript
{
  budget_id: string
  scheduled_transaction_id: string
}
```

**Returns**: Deleted scheduled transaction object

### 2.10 Category Allocation Tools

#### ynab_recommend_category_allocation
**Purpose**: Provide intelligent category allocation recommendations based on spending patterns

**Parameters**:
```typescript
{
  budget_id: string
  month: string                  // YYYY-MM-DD
  available_to_budget: number    // Milliunits available
  strategy?: "proportional" | "goals_first" | "essential_first" | "balanced"
  lookback_months?: number       // Months of history to analyze (default: 6)
}
```

**Returns**:
```typescript
{
  recommendations: Array<{
    category_id: string
    category_name: string
    category_group_name: string
    recommended_amount: number    // Milliunits
    reasoning: string            // Explanation for recommendation
    priority: number             // 1-10 (10 being highest)
    average_spending: number     // Historical average
    goal_target?: number         // If category has a goal
    current_balance: number      // Current category balance
  }>
  total_recommended: number      // Sum of all recommendations
  remaining_available: number    // Amount not allocated
  insights: {
    overspending_categories: Array<string>
    underfunded_goals: Array<string>
    irregular_expenses: Array<{
      category_id: string
      expected_date: string
      expected_amount: number
    }>
  }
}
```

#### ynab_analyze_spending_patterns
**Purpose**: Analyze historical spending to identify patterns and trends

**Parameters**:
```typescript
{
  budget_id: string
  start_date: string             // YYYY-MM-DD
  end_date: string               // YYYY-MM-DD
  category_id?: string           // Optional: Analyze specific category
}
```

**Returns**:
```typescript
{
  patterns: Array<{
    category_id: string
    category_name: string
    monthly_average: number
    monthly_median: number
    standard_deviation: number
    trend: "increasing" | "decreasing" | "stable"
    trend_percentage: number     // Monthly change rate
    highest_month: {
      month: string
      amount: number
    }
    lowest_month: {
      month: string
      amount: number
    }
    frequency: "daily" | "weekly" | "monthly" | "irregular"
    predictability_score: number  // 0-100
  }>
  total_spending: {
    average: number
    median: number
    trend: string
  }
  recommendations: Array<string>  // Actionable insights
}
```

#### ynab_distribute_to_be_budgeted
**Purpose**: Automatically distribute To Be Budgeted amount across categories

**Parameters**:
```typescript
{
  budget_id: string
  month: string
  distribution_method: "template" | "average" | "goals" | "custom"
  template_month?: string        // For "template" method
  custom_rules?: Array<{         // For "custom" method
    category_id: string
    amount?: number
    percentage?: number
    max_amount?: number
  }>
  respect_goals?: boolean        // Fund goals first (default: true)
  emergency_fund_first?: boolean // Prioritize emergency fund
}
```

**Returns**:
```typescript
{
  distributions: Array<{
    category_id: string
    category_name: string
    amount_allocated: number
    reason: string
  }>
  total_distributed: number
  remaining: number
  goals_funded: number
  goals_remaining: number
}
```

### 2.11 Settings Tools

#### ynab_get_budget_settings
**Purpose**: Retrieve budget settings and configuration

**Parameters**:
```typescript
{
  budget_id: string
}
```

**Returns**:
```typescript
{
  settings: {
    date_format: {
      format: string
    }
    currency_format: {
      iso_code: string
      example_format: string
      decimal_digits: number
      decimal_separator: string
      symbol_first: boolean
      group_separator: string
      currency_symbol: string
      display_symbol: boolean
    }
  }
}
```

## 3. Data Types and Conventions

### 3.1 Currency (Milliunits)
- All amounts are in **milliunits** (1/1000th of currency unit)
- $1.00 USD = 1000 milliunits
- €25.50 EUR = 25500 milliunits
- Negative values represent outflows/expenses
- Positive values represent inflows/income

### 3.2 Date Formats
- All dates use ISO 8601 format: `YYYY-MM-DD`
- Month parameters: First day of month (e.g., `2024-01-01` for January 2024)
- Timestamps use ISO 8601 with timezone: `2024-01-15T10:30:00Z`

### 3.3 IDs
- All IDs are UUIDs in format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- IDs are case-sensitive
- Special IDs:
  - `last-used`: References the last used entity of that type
  - `default`: References the default budget

### 3.4 Cleared Status
- `uncleared`: Transaction pending
- `cleared`: Transaction confirmed
- `reconciled`: Transaction reconciled with bank

### 3.5 Flag Colors
- Valid values: `red`, `orange`, `yellow`, `green`, `blue`, `purple`, `null`
- Use `null` to remove a flag

### 3.6 Transfer Linking
- Transfers require `transfer_payee_id` from destination account
- Set `payee_id` to destination account's `transfer_payee_id`
- YNAB automatically creates matching transaction in destination
- Both transactions linked via `transfer_transaction_id`

## 4. Implementation Requirements

### 4.1 Connection Management
- Use persistent HTTP/2 connections
- Connection pooling with max 5 concurrent connections
- Automatic reconnection on failure
- Request timeout: 30 seconds

### 4.2 Retry Logic
```typescript
// Retry configuration
{
  maxRetries: 3,
  initialDelay: 1000,      // 1 second
  maxDelay: 10000,         // 10 seconds
  backoffMultiplier: 2,
  retryableStatuses: [429, 500, 502, 503, 504],
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND']
}
```

### 4.3 Rate Limiting Implementation
```typescript
class RateLimiter {
  private tokens: number = 200
  private lastRefill: Date = new Date()
  private readonly capacity: number = 200
  private readonly refillRate: number = 200 / 3600000 // per millisecond
  
  async acquire(): Promise<void> {
    // Refill tokens based on time elapsed
    const now = new Date()
    const elapsed = now.getTime() - this.lastRefill.getTime()
    this.tokens = Math.min(this.capacity, this.tokens + (elapsed * this.refillRate))
    this.lastRefill = now
    
    if (this.tokens < 1) {
      const waitTime = (1 - this.tokens) / this.refillRate
      await sleep(waitTime)
      return this.acquire()
    }
    
    this.tokens--
  }
}
```

### 4.4 Batch Operations
- Maximum batch size: 100 transactions per request
- Automatic batching for operations exceeding limit
- Parallel batch processing where possible
- Transaction ordering preservation within batches

### 4.5 Delta Sync Support
- Use `last_knowledge_of_server` parameter for incremental updates
- Store and return `server_knowledge` values
- Only fetch changed data since last sync
- Reduces API calls and improves performance

### 4.6 Validation Requirements
- Validate all UUIDs match expected format
- Validate dates are valid ISO 8601
- Validate amounts are integers (milliunits)
- Validate enum values (cleared status, flag colors, etc.)
- Validate required fields before API calls

## 5. Error Handling Specifications

### 5.1 Error Response Format
```typescript
interface ErrorResponse {
  error: {
    type: 'validation' | 'not_found' | 'rate_limit' | 'auth' | 'api_error'
    message: string
    details?: {
      status_code?: number
      field?: string
      value?: any
      resource_type?: string
      resource_id?: string
      retry_after?: number    // Seconds for rate limit
    }
  }
}
```

### 5.2 Error Type Mappings
| HTTP Status | Error Type | Action |
|------------|------------|---------|
| 400 | validation | Return field-specific errors |
| 401 | auth | Invalid token message |
| 404 | not_found | Include resource type and ID |
| 409 | validation | Duplicate or conflict error |
| 429 | rate_limit | Include retry_after header |
| 500-599 | api_error | Retry with backoff |

### 5.3 User-Friendly Messages
```typescript
const errorMessages = {
  validation: {
    invalid_date: "Date must be in YYYY-MM-DD format",
    invalid_amount: "Amount must be an integer in milliunits",
    missing_field: "Required field '{field}' is missing",
    invalid_uuid: "'{field}' must be a valid UUID"
  },
  not_found: {
    budget: "Budget with ID '{id}' not found",
    transaction: "Transaction with ID '{id}' not found",
    account: "Account with ID '{id}' not found",
    category: "Category with ID '{id}' not found"
  },
  rate_limit: {
    exceeded: "Rate limit exceeded. Please wait {retry_after} seconds"
  }
}
```

## 6. Testing Requirements

### 6.1 Unit Tests
- Test each tool parameter validation
- Test error response formatting
- Test rate limiter logic
- Test batch splitting logic
- Test retry mechanism

### 6.2 Integration Tests
- Test actual YNAB API calls with test budget
- Test rate limit handling
- Test batch operations
- Test delta sync
- Test transfer creation
- Test split transaction creation

### 6.3 Error Scenario Tests
- Invalid token
- Non-existent resources
- Rate limit exceeded
- Network failures
- Timeout scenarios
- Malformed requests

### 6.4 Performance Tests
- Batch operation throughput
- Connection pooling efficiency
- Rate limiter accuracy
- Memory usage under load

## 7. Security Requirements

### 7.1 Token Management
- Never log or expose API tokens
- Store tokens in environment variables only
- Validate token format before use
- Clear tokens from memory when not needed

### 7.2 Data Privacy
- No persistent storage of user data
- Clear sensitive data from logs
- Use HTTPS for all API calls
- Validate SSL certificates

### 7.3 Input Validation
- Sanitize all user inputs
- Prevent injection attacks
- Validate data types and ranges
- Limit string lengths

## 8. Deployment Considerations

### 8.1 Environment Variables
```bash
YNAB_API_TOKEN=your-token-here
YNAB_API_BASE_URL=https://api.ynab.com/v1  # Optional override
MCP_SERVER_PORT=3000                        # Optional, default 3000
LOG_LEVEL=info                              # debug|info|warn|error
```

### 8.2 Resource Requirements
- Memory: 256MB minimum, 512MB recommended
- CPU: 0.5 vCPU minimum
- Network: Low bandwidth, latency sensitive
- Storage: None required (stateless)

### 8.3 Monitoring
- Log all API calls with response times
- Track rate limit usage
- Monitor error rates by type
- Alert on authentication failures

## 9. MCP Protocol Implementation

### 9.1 Tool Registration
Each tool must be registered with the MCP protocol including:
- Unique tool name (e.g., `ynab_get_transactions`)
- Description for LLM understanding
- JSON Schema for parameters
- Return type schema

### 9.2 Example Tool Registration
```json
{
  "name": "ynab_get_transactions",
  "description": "Retrieve transactions from a YNAB budget with optional filtering by account or date range",
  "inputSchema": {
    "type": "object",
    "properties": {
      "budget_id": {
        "type": "string",
        "description": "The budget ID (UUID format)",
        "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
      },
      "account_id": {
        "type": "string",
        "description": "Optional: Filter by specific account"
      },
      "since_date": {
        "type": "string",
        "description": "Optional: Only return transactions on or after this date (YYYY-MM-DD)",
        "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
      }
    },
    "required": ["budget_id"]
  }
}
```

## 10. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-01-15 | Initial specification |
| 2.0.0 | 2024-01-15 | Added OAuth 2.0 authentication option, scheduled transaction tools, and category allocation recommendation tools |

## Appendix A: Quick Reference

### Common Operations

**Get all transactions for current month:**
```typescript
ynab_get_transactions({
  budget_id: "xxx",
  since_date: "2024-01-01"
})
```

**Create a scheduled transaction:**
```typescript
ynab_create_scheduled_transaction({
  budget_id: "xxx",
  account_id: "yyy",
  frequency: "monthly",
  amount: -50000,  // $50 monthly subscription
  payee_name: "Netflix",
  category_id: "entertainment-id",
  date_first: "2024-01-15"
})
```

**Get category allocation recommendations:**
```typescript
ynab_recommend_category_allocation({
  budget_id: "xxx",
  month: "2024-02-01",
  available_to_budget: 3500000,  // $3,500 available
  strategy: "goals_first",
  lookback_months: 6
})
```

**Create a transfer between accounts:**
```typescript
// Step 1: Get accounts to find transfer_payee_id
const accounts = await ynab_get_accounts({ budget_id: "xxx" })
const savingsAccount = accounts.find(a => a.name === "Savings")

// Step 2: Create outflow transaction with transfer payee
await ynab_update_transaction({
  budget_id: "xxx",
  transaction_id: "yyy",
  payee_id: savingsAccount.transfer_payee_id,
  category_id: null  // Transfers don't use categories
})
```

**Create a split transaction:**
```typescript
ynab_create_split_transaction({
  budget_id: "xxx",
  account_id: "yyy",
  date: "2024-01-15",
  payee_name: "Walmart",
  subtransactions: [
    {
      amount: -25000,  // $25.00 for groceries
      category_id: "groceries-category-id",
      memo: "Food items"
    },
    {
      amount: -15000,  // $15.00 for household
      category_id: "household-category-id", 
      memo: "Cleaning supplies"
    }
  ]
})
```

**Batch approve transactions:**
```typescript
ynab_batch_update_transactions({
  budget_id: "xxx",
  transactions: [
    { id: "tx1", approved: true },
    { id: "tx2", approved: true },
    { id: "tx3", approved: true }
  ]
})
```

## Appendix B: Error Code Reference

| Code | Type | Description |
|------|------|-------------|
| E001 | validation | Invalid UUID format |
| E002 | validation | Invalid date format |
| E003 | validation | Invalid amount (not integer) |
| E004 | validation | Missing required field |
| E005 | validation | Invalid enum value |
| E010 | not_found | Budget not found |
| E011 | not_found | Account not found |
| E012 | not_found | Transaction not found |
| E013 | not_found | Category not found |
| E014 | not_found | Payee not found |
| E020 | rate_limit | Rate limit exceeded |
| E030 | auth | Invalid API token |
| E031 | auth | Token expired |
| E040 | api_error | YNAB API error |
| E041 | api_error | Network error |
| E042 | api_error | Timeout |

---

**END OF SPECIFICATION**

This specification provides complete coverage for all YNAB operations required by the application plus additional general-purpose functionality. Implementation should follow MCP best practices and maintain compatibility with YNAB API v1.