# API Reference

This document describes the available tools and their usage in the YNAB MCP Server.

## Base Tool Structure

All tools follow the MCP standard and include:
- `name`: Unique identifier for the tool
- `description`: Human-readable description of what the tool does  
- `inputSchema`: Zod schema defining expected input parameters
- `execute`: Async function that performs the tool's operation

## Budget Tools

### get-budgets

Lists all budgets available to the authenticated user.

**Input Schema:**
```typescript
{} // No parameters required
```

**Example Response:**
```json
{
  "budgets": [
    {
      "id": "12345678-1234-1234-1234-123456789012",
      "name": "My Budget",
      "last_modified_on": "2024-01-15T10:30:00Z",
      "first_month": "2024-01-01",
      "last_month": "2024-12-01",
      "currency_format": {
        "iso_code": "USD",
        "currency_symbol": "$",
        "decimal_digits": 2
      }
    }
  ],
  "default_budget": {
    "id": "12345678-1234-1234-1234-123456789012",
    "name": "My Budget"
  }
}
```

### get-budget

Gets detailed information for a specific budget.

**Input Schema:**
```typescript
{
  budgetId: string // UUID of the budget
}
```

**Example Response:**
```json
{
  "id": "12345678-1234-1234-1234-123456789012",
  "name": "My Budget",
  "last_modified_on": "2024-01-15T10:30:00Z",
  "first_month": "2024-01-01",
  "last_month": "2024-12-01",
  "date_format": {
    "format": "MM/DD/YYYY"
  },
  "currency_format": {
    "iso_code": "USD",
    "example_format": "1,234.00",
    "decimal_digits": 2,
    "decimal_separator": ".",
    "symbol_first": true,
    "group_separator": ",",
    "currency_symbol": "$",
    "display_symbol": true
  }
}
```

## Account Tools

### get-accounts

Lists all accounts for a specific budget.

**Input Schema:**
```typescript
{
  budgetId: string // UUID of the budget
}
```

**Example Response:**
```json
{
  "accounts": [
    {
      "id": "account-uuid",
      "name": "Checking Account",
      "type": "checking",
      "on_budget": true,
      "closed": false,
      "balance": 150000, // in milliunits ($150.00)
      "cleared_balance": 145000,
      "uncleared_balance": 5000,
      "transfer_payee_id": "payee-uuid",
      "direct_import_linked": false,
      "direct_import_in_error": false
    }
  ],
  "server_knowledge": 12345
}
```

### get-account

Gets detailed information for a specific account.

**Input Schema:**
```typescript
{
  budgetId: string, // UUID of the budget
  accountId: string // UUID of the account
}
```

## Transaction Tools

### get-transactions

Queries transactions with optional filtering.

**Input Schema:**
```typescript
{
  budgetId: string,           // UUID of the budget (required)
  sinceDate?: string,         // ISO date string (YYYY-MM-DD)
  type?: 'uncategorized' | 'unapproved',
  lastKnowledgeOfServer?: number
}
```

**Example Response:**
```json
{
  "transactions": [
    {
      "id": "transaction-uuid",
      "date": "2024-01-15",
      "amount": -15000, // in milliunits (-$15.00)
      "memo": "Coffee shop",
      "payee_name": "Local Coffee",
      "payee_id": "payee-uuid",
      "category_id": "category-uuid",
      "category_name": "Dining Out",
      "account_id": "account-uuid",
      "account_name": "Checking Account",
      "cleared": "cleared",
      "approved": true,
      "flag_color": null
    }
  ],
  "server_knowledge": 12346
}
```

### get-account-transactions

Gets transactions for a specific account.

**Input Schema:**
```typescript
{
  budgetId: string,           // UUID of the budget (required)
  accountId: string,          // UUID of the account (required)
  sinceDate?: string,         // ISO date string (YYYY-MM-DD)
  type?: 'uncategorized' | 'unapproved',
  lastKnowledgeOfServer?: number
}
```

## Category Tools

### get-categories

Lists all categories and category groups for a budget.

**Input Schema:**
```typescript
{
  budgetId: string // UUID of the budget
}
```

**Example Response:**
```json
{
  "category_groups": [
    {
      "id": "group-uuid",
      "name": "Monthly Bills",
      "hidden": false,
      "deleted": false,
      "categories": [
        {
          "id": "category-uuid",
          "name": "Rent/Mortgage",
          "category_group_id": "group-uuid",
          "category_group_name": "Monthly Bills",
          "budgeted": 120000, // in milliunits ($120.00)
          "activity": -120000,
          "balance": 0,
          "goal_type": null,
          "note": null
        }
      ]
    }
  ],
  "server_knowledge": 12347
}
```

## Payee Tools

### get-payees

Lists all payees for a budget.

**Input Schema:**
```typescript
{
  budgetId: string // UUID of the budget
}
```

**Example Response:**
```json
{
  "payees": [
    {
      "id": "payee-uuid",
      "name": "Local Coffee",
      "transfer_account_id": null,
      "deleted": false
    },
    {
      "id": "transfer-payee-uuid",
      "name": "Transfer : Savings Account",
      "transfer_account_id": "savings-account-uuid",
      "deleted": false
    }
  ],
  "server_knowledge": 12348
}
```

## Error Handling

All tools follow consistent error handling:

- **Validation Errors**: When input parameters don't match the schema
- **API Errors**: When the YNAB API returns an error response
- **Network Errors**: When network requests fail
- **Rate Limit Errors**: When API rate limits are exceeded

Error responses include:
```json
{
  "error": "Tool execution failed: YNAB API Error: Budget not found",
  "code": "INTERNAL_ERROR"
}
```

## Rate Limiting

The server automatically handles YNAB's rate limiting (200 requests per hour):
- Tracks request count and timing
- Automatically delays requests when approaching limits
- Provides rate limit status via internal APIs

## Data Formats

### Currency
- All monetary amounts are in **milliunits** (multiply by 1000)
- Example: $15.00 = 15000 milliunits
- Use utility functions for conversion

### Dates
- API dates are in ISO format: `YYYY-MM-DD`
- Timestamps include time zone: `YYYY-MM-DDTHH:mm:ssZ`

### UUIDs
- All YNAB entities use UUID identifiers
- Format: `12345678-1234-1234-1234-123456789012`