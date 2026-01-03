# Transaction Management Examples

This guide demonstrates comprehensive transaction management using the YNAB MCP Server. Learn how to create, update, delete, and batch process transactions, including complex split transactions and bulk import operations.

## Table of Contents

- [Creating Transactions](#creating-transactions)
- [Updating Transactions](#updating-transactions)  
- [Deleting Transactions](#deleting-transactions)
- [Split Transactions](#split-transactions)
- [Batch Operations](#batch-operations)
- [Import Operations](#import-operations)
- [Transaction Analysis](#transaction-analysis)

---

## Creating Transactions

### Basic Transaction Creation

**Human Request:**
> "I just spent $15.50 on lunch at Subway, put it in my dining out category"

**Claude Code Usage:**
```javascript
ynab_create_transaction({
  budget_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  account_id: "checking-account-id",
  payee_name: "Subway", // Will create payee if it doesn't exist
  category_id: "dining-out-category-id",
  amount: -15500, // $15.50 in milliunits (negative for outflow)
  memo: "Lunch break",
  date: "2024-01-15",
  cleared: "cleared"
})
```

**Response:**
```json
{
  "transaction": {
    "id": "transaction-123",
    "date": "2024-01-15",
    "amount": {
      "milliunits": -15500,
      "formatted": "-$15.50"
    },
    "memo": "Lunch break",
    "cleared": "cleared",
    "approved": true,
    "payee_name": "Subway",
    "category_name": "Dining Out",
    "account_name": "Checking Account"
  },
  "payee_created": {
    "id": "payee-456",
    "name": "Subway"
  }
}
```

### Income Transaction

**Human Request:**
> "Record my paycheck of $2,800 that was deposited today"

**Claude Code Usage:**
```javascript
ynab_create_transaction({
  budget_id: "budget-id",
  account_id: "checking-account-id", 
  payee_name: "Employer Inc",
  category_id: null, // Income doesn't need a category
  amount: 2800000, // $2,800 in milliunits (positive for inflow)
  memo: "Bi-weekly salary",
  date: "2024-01-15",
  cleared: "cleared"
})
```

### Transaction with Flag

**Human Request:**
> "I bought something for $50 that I need to remember to return, flag it red"

**Claude Code Usage:**
```javascript
ynab_create_transaction({
  budget_id: "budget-id", 
  account_id: "credit-card-account-id",
  payee_name: "Store Name",
  category_id: "clothing-category-id",
  amount: -50000,
  memo: "Item to return - receipt in wallet",
  date: "2024-01-15", 
  flag_color: "red",
  cleared: "uncleared"
})
```

### Transaction with Import ID

**Human Request:**
> "Create a transaction for my bank import to avoid duplicates"

**Claude Code Usage:**
```javascript
ynab_create_transaction({
  budget_id: "budget-id",
  account_id: "checking-account-id",
  payee_name: "Gas Station",
  category_id: "transportation-category-id", 
  amount: -45000,
  memo: "Fuel up",
  date: "2024-01-15",
  import_id: "bank_import_20240115_001", // Unique identifier
  cleared: "cleared"
})
```

**Key Points:**
- Import IDs must be unique within the budget
- Prevents duplicate transactions from bank imports
- Use format like: `source_date_sequence`

---

## Updating Transactions

### Basic Transaction Update

**Human Request:**
> "I need to change that $15.50 Subway transaction to $17.25 and add a tip"

**Claude Code Usage:**
```javascript
ynab_update_transaction({
  budget_id: "budget-id",
  transaction_id: "transaction-123",
  amount: -17250, // New amount including tip
  memo: "Lunch break + tip"
})
```

**Response:**
```json
{
  "transaction": {
    "id": "transaction-123",
    "amount": {
      "milliunits": -17250,
      "formatted": "-$17.25"
    },
    "memo": "Lunch break + tip"
  },
  "changes_made": ["amount", "memo"]
}
```

### Change Transaction Category

**Human Request:**
> "Move that grocery store transaction from 'Groceries' to 'Household Items'"

**Claude Code Usage:**
```javascript
ynab_update_transaction({
  budget_id: "budget-id",
  transaction_id: "grocery-transaction-id",
  category_id: "household-items-category-id"
})
```

### Update Cleared Status

**Human Request:**
> "Mark all my pending transactions as cleared since they showed up on my bank statement"

This requires multiple update calls or the batch update tool:

```javascript
ynab_batch_update_transactions({
  budget_id: "budget-id", 
  transactions: [
    {
      id: "transaction-1",
      cleared: "cleared"
    },
    {
      id: "transaction-2", 
      cleared: "cleared"
    },
    {
      id: "transaction-3",
      cleared: "cleared"
    }
  ]
})
```

### Fix Transaction Details

**Human Request:**
> "I entered the wrong date and payee for a transaction - it should be 'Coffee Shop' on January 10th, not 'Cafe' on January 12th"

**Claude Code Usage:**
```javascript
ynab_update_transaction({
  budget_id: "budget-id",
  transaction_id: "incorrect-transaction-id", 
  payee_name: "Coffee Shop", // Will create payee if needed
  date: "2024-01-10",
  memo: "Fixed date and payee name"
})
```

---

## Deleting Transactions

### Delete Single Transaction

**Human Request:**
> "Delete that duplicate transaction I created by mistake"

**Claude Code Usage:**
```javascript
ynab_delete_transaction({
  budget_id: "budget-id",
  transaction_id: "duplicate-transaction-id"
})
```

**Response:**
```json
{
  "deleted_transaction": {
    "id": "duplicate-transaction-id",
    "deleted": true
  },
  "success": true
}
```

**Important Notes:**
- Deleted transactions can't be recovered through the API
- Consider updating instead of deleting when possible
- Deleting affects category balances immediately

---

## Split Transactions

### Basic Split Transaction

**Human Request:**
> "I went to Target and spent $85 total: $45 on groceries, $25 on household items, and $15 on clothing"

**Claude Code Usage:**
```javascript
ynab_create_split_transaction({
  budget_id: "budget-id",
  account_id: "checking-account-id",
  payee_name: "Target",
  date: "2024-01-15",
  memo: "Shopping trip",
  cleared: "cleared",
  subtransactions: [
    {
      amount: -45000, // $45 for groceries
      category_id: "groceries-category-id",
      memo: "Food and beverages"
    },
    {
      amount: -25000, // $25 for household items
      category_id: "household-category-id", 
      memo: "Cleaning supplies"
    },
    {
      amount: -15000, // $15 for clothing
      category_id: "clothing-category-id",
      memo: "T-shirt"
    }
  ]
})
```

**Response:**
```json
{
  "transaction": {
    "id": "split-transaction-123",
    "date": "2024-01-15",
    "amount": {
      "milliunits": -85000,
      "formatted": "-$85.00"
    },
    "subtransactions": [
      {
        "id": "sub-1", 
        "amount": {
          "milliunits": -45000,
          "formatted": "-$45.00"
        },
        "category_name": "Groceries",
        "memo": "Food and beverages"
      },
      {
        "id": "sub-2",
        "amount": {
          "milliunits": -25000, 
          "formatted": "-$25.00"
        },
        "category_name": "Household Items",
        "memo": "Cleaning supplies"
      },
      {
        "id": "sub-3",
        "amount": {
          "milliunits": -15000,
          "formatted": "-$15.00"
        },
        "category_name": "Clothing",
        "memo": "T-shirt"
      }
    ]
  },
  "validation": {
    "splits_sum_correct": true,
    "total_splits": 3
  }
}
```

### Split with Transfer

**Human Request:**
> "I paid my credit card $300: $250 from checking and $50 from savings"

**Claude Code Usage:**
```javascript
ynab_create_split_transaction({
  budget_id: "budget-id",
  account_id: "credit-card-account-id", // Money going TO credit card
  payee_name: "Transfer : Credit Card Payment",
  date: "2024-01-15",
  memo: "Monthly payment from multiple accounts",
  subtransactions: [
    {
      amount: 250000, // $250 FROM checking (positive inflow to credit card)
      transfer_account_id: "checking-account-id",
      memo: "Primary payment"
    },
    {
      amount: 50000, // $50 FROM savings (positive inflow to credit card) 
      transfer_account_id: "savings-account-id",
      memo: "Additional payment"
    }
  ]
})
```

### Updating Split Transactions

**Human Request:**
> "I need to change that Target split - the groceries were actually $50, not $45, and add a $5 pharmacy item"

**Claude Code Usage:**
```javascript
ynab_update_transaction_splits({
  budget_id: "budget-id",
  transaction_id: "split-transaction-123",
  subtransactions: [
    {
      id: "sub-1", // Existing grocery split
      amount: -50000, // Updated amount
      memo: "Food and beverages - corrected"
    },
    {
      id: "sub-2", // Keep household items the same
      amount: -25000,
      memo: "Cleaning supplies"
    },
    {
      id: "sub-3", // Keep clothing the same  
      amount: -15000,
      memo: "T-shirt"
    },
    {
      // New pharmacy split (no id = new split)
      amount: -5000,
      category_id: "pharmacy-category-id", 
      memo: "Vitamins"
    }
  ]
})
```

**Response:**
```json
{
  "transaction": {
    "id": "split-transaction-123",
    "subtransactions": [
      // Updated and new splits
    ]
  },
  "changes": {
    "added_splits": 1,
    "updated_splits": 1, 
    "deleted_splits": 0
  },
  "validation": {
    "splits_sum_correct": true,
    "total_active_splits": 4
  }
}
```

### Removing Split Items

**Human Request:**
> "Remove the clothing split from that Target transaction - I returned that item"

**Claude Code Usage:**
```javascript
ynab_update_transaction_splits({
  budget_id: "budget-id", 
  transaction_id: "split-transaction-123",
  subtransactions: [
    {
      id: "sub-1", // Keep grocery split
      amount: -50000
    },
    {
      id: "sub-2", // Keep household split 
      amount: -25000
    },
    {
      id: "sub-3", // Mark clothing split for deletion
      amount: -15000,
      delete: true
    },
    {
      id: "sub-4", // Keep pharmacy split
      amount: -5000
    }
  ]
})
```

---

## Batch Operations

### Batch Update Multiple Transactions

**Human Request:**
> "I need to update 5 transactions: clear them all and change their categories based on my receipts"

**Claude Code Usage:**
```javascript
ynab_batch_update_transactions({
  budget_id: "budget-id",
  transactions: [
    {
      id: "transaction-1",
      cleared: "cleared",
      category_id: "groceries-category-id"
    },
    {
      id: "transaction-2", 
      cleared: "cleared",
      category_id: "gas-category-id",
      memo: "Updated with receipt info"
    },
    {
      id: "transaction-3",
      cleared: "cleared", 
      payee_name: "Corrected Payee Name",
      category_id: "dining-out-category-id"
    },
    {
      id: "transaction-4",
      cleared: "cleared",
      amount: -32500, // Corrected amount
      category_id: "utilities-category-id"
    },
    {
      id: "transaction-5",
      cleared: "cleared",
      flag_color: "green", // Mark as reviewed
      category_id: "entertainment-category-id"
    }
  ]
})
```

**Response:**
```json
{
  "transactions": [
    // Array of updated transactions
  ],
  "results": {
    "updated_count": 5,
    "failed_count": 0,
    "errors": []
  },
  "payees_created": [
    {
      "id": "new-payee-id",
      "name": "Corrected Payee Name"
    }
  ]
}
```

### Categorize Multiple Uncategorized Transactions

**Human Request:**
> "I have 10 uncategorized transactions that I need to categorize based on the payee patterns"

**Step 1: Get uncategorized transactions**
```javascript
ynab_get_transactions({
  budget_id: "budget-id",
  type: "uncategorized",
  limit: 50
})
```

**Step 2: Batch categorize based on patterns**
```javascript
ynab_batch_update_transactions({
  budget_id: "budget-id",
  transactions: [
    // Gas stations -> Transportation
    { id: "trans-1", category_id: "transportation-category-id" },
    { id: "trans-2", category_id: "transportation-category-id" },
    
    // Restaurants -> Dining Out  
    { id: "trans-3", category_id: "dining-out-category-id" },
    { id: "trans-4", category_id: "dining-out-category-id" },
    { id: "trans-5", category_id: "dining-out-category-id" },
    
    // Grocery stores -> Groceries
    { id: "trans-6", category_id: "groceries-category-id" },
    { id: "trans-7", category_id: "groceries-category-id" },
    
    // Utilities -> Utilities
    { id: "trans-8", category_id: "utilities-category-id" },
    { id: "trans-9", category_id: "utilities-category-id" },
    { id: "trans-10", category_id: "utilities-category-id" }
  ]
})
```

---

## Import Operations

### Import from CSV/Bank File

**Human Request:**
> "I have a CSV file with 50 transactions from my bank. Import them all and create any missing payees"

**Claude Code Usage:**
```javascript
ynab_import_transactions({
  budget_id: "budget-id",
  transactions: [
    {
      account_id: "checking-account-id",
      payee_name: "AMAZON.COM AMZN.COM/BILL",
      amount: -45670, 
      date: "2024-01-15",
      import_id: "bank_20240115_001",
      memo: "Online purchase",
      cleared: "cleared"
    },
    {
      account_id: "checking-account-id", 
      payee_name: "STARBUCKS STORE #1234",
      amount: -650,
      date: "2024-01-15", 
      import_id: "bank_20240115_002",
      cleared: "cleared"
    },
    // ... 48 more transactions
  ],
  duplicate_handling: "skip", // Skip duplicates based on import_id
  create_payees: true, // Auto-create missing payees
  validate_accounts: true // Verify account exists
})
```

**Response:**
```json
{
  "import_result": {
    "total_transactions": 50,
    "successful_imports": 47,
    "skipped_duplicates": 2,
    "failed_imports": 1,
    "created_payees": 8
  },
  "successful_transactions": [
    {
      "import_id": "bank_20240115_001",
      "transaction_id": "new-transaction-123",
      "amount": {
        "milliunits": -45670,
        "formatted": "-$45.67"
      },
      "payee_name": "AMAZON.COM AMZN.COM/BILL", 
      "account_name": "Checking Account"
    }
    // ... more successful imports
  ],
  "failed_transactions": [
    {
      "import_id": "bank_20240115_050",
      "error": "Invalid account_id",
      "details": {
        "account_id": "invalid-account-id"
      }
    }
  ],
  "duplicate_transactions": [
    {
      "import_id": "bank_20240115_025",
      "existing_transaction_id": "existing-transaction-456",
      "action_taken": "skipped"
    },
    {
      "import_id": "bank_20240115_033", 
      "existing_transaction_id": "existing-transaction-789",
      "action_taken": "skipped"
    }
  ],
  "created_payees": [
    {
      "id": "payee-new-1",
      "name": "NEW RESTAURANT LLC"
    },
    {
      "id": "payee-new-2", 
      "name": "ONLINE SUBSCRIPTION SERVICE"
    }
    // ... 6 more created payees
  ]
}
```

### Import with Category Mapping

**Human Request:**
> "Import these transactions but automatically categorize them based on payee patterns"

**Claude Code Usage:**
```javascript
ynab_import_transactions({
  budget_id: "budget-id",
  transactions: [
    {
      account_id: "checking-account-id",
      payee_name: "WHOLE FOODS MARKET",
      category_id: "groceries-category-id", // Pre-categorized
      amount: -12500,
      date: "2024-01-15", 
      import_id: "bank_20240115_001"
    },
    {
      account_id: "checking-account-id",
      payee_name: "SHELL OIL",
      category_id: "transportation-category-id", // Pre-categorized
      amount: -4500,
      date: "2024-01-15",
      import_id: "bank_20240115_002" 
    }
    // ... more pre-categorized transactions
  ],
  create_payees: true,
  validate_categories: true // Verify category IDs exist
})
```

### Handle Import Errors

**Human Request:**
> "Some of my imported transactions failed - help me fix and retry them"

**Analysis of Failed Transactions:**
```json
{
  "failed_transactions": [
    {
      "import_id": "bank_20240115_010",
      "error": "Invalid category_id", 
      "details": {
        "category_id": "deleted-category-id"
      }
    },
    {
      "import_id": "bank_20240115_025",
      "error": "Amount must be an integer",
      "details": {
        "amount": 45.67 // Should be 45670 in milliunits
      }
    }
  ]
}
```

**Retry with Corrections:**
```javascript
ynab_import_transactions({
  budget_id: "budget-id",
  transactions: [
    {
      account_id: "checking-account-id",
      payee_name: "PROBLEM PAYEE 1", 
      category_id: "correct-category-id", // Fixed category
      amount: -5000,
      date: "2024-01-15",
      import_id: "bank_20240115_010_retry"
    },
    {
      account_id: "checking-account-id",
      payee_name: "PROBLEM PAYEE 2",
      amount: -4567, // Fixed amount format (milliunits)
      date: "2024-01-15",
      import_id: "bank_20240115_025_retry" 
    }
  ]
})
```

---

## Transaction Analysis

### Find Duplicate Transactions

**Human Request:**
> "Help me find and clean up duplicate transactions in my budget"

**Approach:**

1. **Get all transactions for analysis:**
```javascript
ynab_get_transactions({
  budget_id: "budget-id",
  since_date: "2024-01-01",
  limit: 1000
})
```

2. **Analyze for potential duplicates:**
   - Same amount and date
   - Same payee and account 
   - Similar timestamps (within hours)

3. **Review and delete confirmed duplicates:**
```javascript
ynab_delete_transaction({
  budget_id: "budget-id", 
  transaction_id: "confirmed-duplicate-id"
})
```

### Reconciliation Workflow

**Human Request:**
> "Help me reconcile my checking account with my bank statement"

**Workflow:**

1. **Get all uncleared transactions:**
```javascript
ynab_get_transactions({
  budget_id: "budget-id",
  account_id: "checking-account-id",
  cleared_status: "uncleared"
})
```

2. **Mark cleared transactions:**
```javascript
ynab_batch_update_transactions({
  budget_id: "budget-id",
  transactions: [
    { id: "transaction-1", cleared: "cleared" },
    { id: "transaction-2", cleared: "cleared" },
    // ... all transactions that appear on statement
  ]
})
```

3. **Identify discrepancies:**
   - Transactions in YNAB but not on statement
   - Transactions on statement but not in YNAB
   - Amount differences

### Transaction Pattern Analysis

**Human Request:**
> "Show me my spending patterns by analyzing my transaction history"

**Analysis Steps:**

1. **Get comprehensive transaction data:**
```javascript
ynab_get_transactions({
  budget_id: "budget-id",
  since_date: "2023-01-01", // Full year of data
  include_subtransactions: true
})
```

2. **Group by categories and payees:**
   - Total spending by category
   - Most frequent payees
   - Average transaction amounts
   - Spending trends over time

3. **Identify insights:**
   - Categories with highest spending
   - Unusual or large transactions
   - Seasonal spending patterns
   - Potential cost-cutting opportunities

---

## Best Practices

### Transaction Entry Guidelines

1. **Be Consistent:**
   - Use consistent payee names
   - Standardize memo formats
   - Apply flags systematically

2. **Use Import IDs:**
   - Always provide import IDs for bank imports
   - Use meaningful, unique identifiers
   - Format: `source_date_sequence`

3. **Validate Data:**
   - Verify amounts are in milliunits
   - Check date formats (YYYY-MM-DD)
   - Confirm account and category IDs exist

### Error Prevention

1. **Amount Conversion:**
```javascript
// Correct: Convert dollars to milliunits
const dollars = 45.67;
const milliunits = Math.round(dollars * 1000); // 45670

// Incorrect: Using dollar amounts directly
const amount = 45.67; // Will cause errors
```

2. **Date Formatting:**
```javascript
// Correct: ISO date format
const date = "2024-01-15";

// Incorrect: Other formats
const badDate = "1/15/2024"; // Will cause errors
const alsobad = "Jan 15, 2024"; // Will cause errors
```

3. **Payee Management:**
```javascript
// Best: Create payees explicitly first
ynab_create_payee({ budget_id: "id", name: "New Store" });

// Good: Use payee_name for auto-creation  
{ payee_name: "New Store" } // Creates if doesn't exist

// Avoid: Using payee_id for non-existent payees
{ payee_id: "non-existent-id" } // Will cause errors
```

### Performance Optimization

1. **Batch Operations:**
   - Use batch updates for multiple transactions
   - Import in chunks of 50-100 transactions
   - Group related operations together

2. **Delta Sync:**
   - Use `last_knowledge_of_server` for incremental updates
   - Store server knowledge between requests
   - Only fetch changed data when possible

3. **Efficient Queries:**
   - Use date ranges to limit results
   - Apply account/category filters when possible
   - Set appropriate limits for large datasets

---

This comprehensive guide covers all aspects of transaction management with the YNAB MCP Server. The key is to establish consistent patterns and use batch operations when working with multiple transactions.