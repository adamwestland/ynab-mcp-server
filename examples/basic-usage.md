# Basic Usage Examples

This guide provides practical examples for getting started with the YNAB MCP Server. These examples demonstrate the most common operations you'll need when working with your YNAB data through Claude Code.

## Table of Contents

- [Getting Started](#getting-started)
- [Budget Discovery](#budget-discovery)
- [Account Information](#account-information)
- [Basic Transaction Queries](#basic-transaction-queries)
- [Category Information](#category-information)
- [Payee Management](#payee-management)
- [Error Handling](#error-handling)

---

## Getting Started

Before using any YNAB tools, you need to:

1. **Set up the MCP server** (see main README.md)
2. **Obtain your YNAB API token** from [YNAB Developer Settings](https://app.youneedabudget.com/settings/developer)
3. **Configure Claude Code** with the server

Once configured, you can start asking Claude Code to help with your budget:

```
"Can you show me all my YNAB budgets?"
"What are my account balances?"
"Show me my recent transactions from last month"
```

---

## Budget Discovery

### List All Available Budgets

**Human Request:**
> "Show me all my YNAB budgets with their basic information"

**Claude Code Usage:**
```javascript
ynab_list_budgets({
  include_accounts: false
})
```

**Expected Response:**
```json
{
  "budgets": [
    {
      "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "name": "My Family Budget",
      "currency_format": {
        "iso_code": "USD",
        "example_format": "$123,456.78",
        "decimal_digits": 2,
        "decimal_separator": ".",
        "symbol_first": true,
        "group_separator": ",",
        "currency_symbol": "$",
        "display_symbol": true
      },
      "date_format": {
        "format": "MM/DD/YYYY"
      },
      "first_month": "2023-01-01",
      "last_month": "2024-12-01"
    }
  ],
  "default_budget": {
    "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "name": "My Family Budget"
  }
}
```

### List Budgets with Account Counts

**Human Request:**
> "Show me all my budgets and how many accounts each has"

**Claude Code Usage:**
```javascript
ynab_list_budgets({
  include_accounts: true
})
```

This will include account details for each budget, helping you understand the structure of your finances.

---

## Account Information

### Get All Accounts for a Budget

**Human Request:**
> "What are all my accounts and their current balances?"

**Claude Code Usage:**
```javascript
ynab_get_accounts({
  budget_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
})
```

**Expected Response:**
```json
{
  "accounts": [
    {
      "id": "account-1",
      "name": "Checking Account",
      "type": "checking",
      "on_budget": true,
      "closed": false,
      "balance": 125043,
      "cleared_balance": 125043,
      "uncleared_balance": 0,
      "transfer_payee_id": "payee-transfer-1",
      "formatted_balance": "$125.04"
    },
    {
      "id": "account-2",
      "name": "Savings Account",
      "type": "savings",
      "on_budget": true,
      "closed": false,
      "balance": 1500000,
      "cleared_balance": 1500000,
      "uncleared_balance": 0,
      "transfer_payee_id": "payee-transfer-2",
      "formatted_balance": "$1,500.00"
    }
  ]
}
```

### Get Only On-Budget Accounts

**Human Request:**
> "Show me only my on-budget accounts, no tracking accounts"

**Claude Code Usage:**
```javascript
ynab_get_accounts({
  budget_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  on_budget_only: true
})
```

### Get Specific Account Types

**Human Request:**
> "Show me just my credit card accounts"

**Claude Code Usage:**
```javascript
ynab_get_accounts({
  budget_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  account_type: "creditCard"
})
```

**Common Account Types:**
- `checking` - Checking accounts
- `savings` - Savings accounts
- `creditCard` - Credit cards
- `cash` - Cash accounts
- `lineOfCredit` - Lines of credit
- `mortgage` - Mortgage accounts
- `autoLoan` - Auto loans
- `studentLoan` - Student loans

---

## Basic Transaction Queries

### Get Recent Transactions

**Human Request:**
> "Show me all transactions from the last 30 days"

**Claude Code Usage:**
```javascript
ynab_get_transactions({
  budget_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  since_date: "2024-01-01", // Adjust date as needed
  limit: 50
})
```

**Expected Response:**
```json
{
  "transactions": [
    {
      "id": "transaction-1",
      "date": "2024-01-15",
      "amount": -4500,
      "memo": "Coffee with friends",
      "cleared": "cleared",
      "approved": true,
      "flag_color": null,
      "account_id": "account-1",
      "account_name": "Checking Account",
      "payee_id": "payee-1",
      "payee_name": "Local Coffee Shop",
      "category_id": "category-1",
      "category_name": "Dining Out",
      "formatted_amount": "-$4.50"
    }
  ]
}
```

### Get Transactions for Specific Account

**Human Request:**
> "Show me recent transactions for my checking account"

**Claude Code Usage:**
```javascript
ynab_get_transactions({
  budget_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  account_id: "checking-account-id",
  since_date: "2024-01-01",
  limit: 25
})
```

### Get Uncategorized Transactions

**Human Request:**
> "What transactions do I still need to categorize?"

**Claude Code Usage:**
```javascript
ynab_get_transactions({
  budget_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  type: "uncategorized"
})
```

### Get Transactions by Category

**Human Request:**
> "Show me all my grocery spending this month"

**Claude Code Usage:**
```javascript
ynab_get_transactions({
  budget_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  category_id: "grocery-category-id",
  since_date: "2024-01-01"
})
```

### Get Transactions by Payee

**Human Request:**
> "Show me all transactions with Amazon"

**Claude Code Usage:**
```javascript
ynab_get_transactions({
  budget_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  payee_id: "amazon-payee-id",
  since_date: "2024-01-01"
})
```

---

## Category Information

### Get All Categories

**Human Request:**
> "What are all my budget categories?"

**Claude Code Usage:**
```javascript
ynab_get_categories({
  budget_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
})
```

**Expected Response:**
```json
{
  "category_groups": [
    {
      "id": "group-1",
      "name": "Monthly Bills",
      "hidden": false,
      "deleted": false,
      "categories": [
        {
          "id": "category-1",
          "name": "Rent/Mortgage",
          "hidden": false,
          "budgeted": 1500000,
          "activity": -1500000,
          "balance": 0,
          "goal_type": "NEED",
          "goal_target": 1500000
        }
      ]
    }
  ]
}
```

### Get Specific Category Details

**Human Request:**
> "Show me detailed information about my grocery budget category"

**Claude Code Usage:**
```javascript
ynab_get_category({
  budget_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  category_id: "grocery-category-id",
  include_history: true,
  history_months: 6
})
```

This provides detailed category information including historical budget and spending data.

---

## Payee Management

### Get All Payees

**Human Request:**
> "List all the payees in my budget"

**Claude Code Usage:**
```javascript
ynab_get_payees({
  budget_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
})
```

### Get Payee Details with Transaction History

**Human Request:**
> "Show me detailed information about my transactions with Starbucks"

**Claude Code Usage:**
```javascript
ynab_get_payee({
  budget_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  payee_id: "starbucks-payee-id",
  include_transactions: true,
  transaction_limit: 10
})
```

**Expected Response:**
```json
{
  "payee": {
    "id": "starbucks-payee-id",
    "name": "Starbucks",
    "transfer_account_id": null,
    "deleted": false
  },
  "transactions": [
    {
      "id": "trans-1",
      "date": "2024-01-15",
      "amount": {
        "milliunits": -650,
        "formatted": "-$6.50"
      },
      "memo": "Morning coffee",
      "account_name": "Checking Account",
      "category_name": "Dining Out"
    }
  ],
  "statistics": {
    "total_transactions": 15,
    "average_amount": {
      "milliunits": -625,
      "formatted": "-$6.25"
    },
    "total_spent": {
      "milliunits": -9375,
      "formatted": "-$93.75"
    },
    "most_common_category": "Dining Out"
  }
}
```

### Create a New Payee

**Human Request:**
> "Add a new payee called 'New Restaurant'"

**Claude Code Usage:**
```javascript
ynab_create_payee({
  budget_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  name: "New Restaurant"
})
```

---

## Error Handling

### Common Scenarios and Solutions

**Scenario: Budget not found**
```json
{
  "error": "Budget not found",
  "budget_id": "invalid-id"
}
```

**Solution:** Double-check your budget ID by first listing all budgets.

**Scenario: Invalid date format**
```json
{
  "error": "Invalid input parameters",
  "details": {
    "date": "Date must be in YYYY-MM-DD format"
  }
}
```

**Solution:** Always use `YYYY-MM-DD` format for dates (e.g., `2024-01-15`).

**Scenario: Amount not in milliunits**
```json
{
  "error": "Invalid input parameters",
  "details": {
    "amount": "Amount must be an integer in milliunits"
  }
}
```

**Solution:** Convert dollar amounts to milliunits by multiplying by 1000:
- `$10.50` → `10500`
- `$-25.00` → `-25000`

---

## Practical Examples

### Check Budget Health

**Human Request:**
> "Give me an overview of my budget health - accounts, recent spending, and categories that need attention"

This would trigger multiple tool calls:
1. `ynab_list_budgets()` - Get budget info
2. `ynab_get_accounts()` - Get account balances
3. `ynab_get_transactions()` with `type: "uncategorized"` - Find uncategorized transactions
4. `ynab_get_categories()` - Check category balances

### Monthly Budget Review

**Human Request:**
> "Help me review my budget for this month - show me spending by category and identify any overspending"

This would involve:
1. `ynab_get_budget_month()` - Get current month budget data
2. `ynab_get_transactions()` - Get current month transactions
3. Analysis of spending vs. budgeted amounts

### Quick Transaction Entry

**Human Request:**
> "I just spent $12.50 on lunch at Chipotle, categorize it as dining out"

This would use:
1. `ynab_create_transaction()` with proper payee and category assignment
2. Automatic payee creation if "Chipotle" doesn't exist

---

## Tips for Effective Usage

### 1. **Use Natural Language**
Instead of learning tool syntax, just describe what you want:
- ❌ "Call ynab_get_transactions with parameters..."
- ✅ "Show me my grocery spending from last month"

### 2. **Be Specific with Date Ranges**
- ❌ "Show me recent transactions"
- ✅ "Show me transactions from the last 30 days"

### 3. **Combine Related Requests**
- ❌ "Show accounts. Show transactions. Show categories."
- ✅ "Give me a budget overview with accounts, recent transactions, and category status"

### 4. **Ask for Analysis**
- ❌ "Show me transaction data"
- ✅ "Analyze my spending patterns and tell me where I can save money"

### 5. **Request Formatting**
- ❌ "Give me raw transaction data"
- ✅ "Show me my transactions in a readable format with totals by category"

---

This covers the basic operations you'll use most frequently. For more advanced features like AI-powered recommendations, transfer management, and bulk operations, see the other example files in this directory.