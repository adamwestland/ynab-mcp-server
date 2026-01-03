# Transfer Detection and Management Examples

This guide demonstrates how to use the YNAB MCP Server's transfer detection and management capabilities. Learn to identify, link, and manage transfers between accounts effectively.

## Table of Contents

- [Understanding Transfers](#understanding-transfers)
- [Manual Transfer Linking](#manual-transfer-linking)
- [Creating Transfer Transactions](#creating-transfer-transactions)
- [Transfer Unlinking](#transfer-unlinking)
- [Transfer Validation](#transfer-validation)
- [Common Transfer Scenarios](#common-transfer-scenarios)
- [Troubleshooting](#troubleshooting)

---

## Understanding Transfers

In YNAB, transfers represent money moving between your accounts and don't affect your budget categories. They need to be properly linked to avoid double-counting income and expenses.

### Transfer Characteristics

- **Same Amount**: Both transactions have matching amounts (one positive, one negative)
- **Same Date**: Usually occur on the same date (though may differ due to processing times)
- **Different Accounts**: One transaction per account involved
- **No Category**: Transfer transactions don't use budget categories
- **Special Payee**: Often use "Transfer : [Account Name]" as payee

### Transfer Types

1. **Account-to-Account**: Moving money between your own accounts
2. **Credit Card Payments**: Paying credit card from checking/savings
3. **Loan Payments**: Principal portion of loan payments
4. **Investment Contributions**: Moving money to investment accounts

---

## Manual Transfer Linking

### Basic Transfer Link

**Human Request:**
> "I moved $500 from checking to savings yesterday. The transactions exist but aren't linked as a transfer"

**Step 1: Find the transactions**
```javascript
// Find the outflow from checking
ynab_get_transactions({
  budget_id: "budget-id",
  account_id: "checking-account-id",
  since_date: "2024-01-14", // Yesterday
  limit: 10
})

// Find the inflow to savings
ynab_get_transactions({
  budget_id: "budget-id", 
  account_id: "savings-account-id",
  since_date: "2024-01-14",
  limit: 10
})
```

**Step 2: Link the transactions**
```javascript
ynab_link_transfer({
  budget_id: "budget-id",
  transaction_id_1: "checking-outflow-transaction-id", // -$500
  transaction_id_2: "savings-inflow-transaction-id"    // +$500
})
```

**Response:**
```json
{
  "transfer_link": {
    "transaction_1": {
      "id": "checking-outflow-transaction-id",
      "account_id": "checking-account-id",
      "account_name": "Checking Account",
      "amount": {
        "milliunits": -500000,
        "formatted": "-$500.00"
      },
      "transfer_account_id": "savings-account-id",
      "transfer_transaction_id": "savings-inflow-transaction-id"
    },
    "transaction_2": {
      "id": "savings-inflow-transaction-id", 
      "account_id": "savings-account-id",
      "account_name": "Savings Account",
      "amount": {
        "milliunits": 500000,
        "formatted": "$500.00"
      },
      "transfer_account_id": "checking-account-id",
      "transfer_transaction_id": "checking-outflow-transaction-id"
    }
  },
  "validation": {
    "amounts_match": true,
    "dates_match": true,
    "is_valid_transfer": true
  }
}
```

### Credit Card Payment Transfer

**Human Request:**
> "I paid my credit card $1,200 from my checking account. Link these transactions as a transfer"

**Claude Code Usage:**
```javascript
ynab_link_transfer({
  budget_id: "budget-id",
  transaction_id_1: "checking-payment-transaction-id", // -$1,200 from checking
  transaction_id_2: "credit-card-payment-transaction-id" // +$1,200 to credit card (reduces balance)
})
```

**Key Points:**
- Credit card payments reduce the card balance (positive amount on credit card)
- The checking account shows negative amount (money leaving)
- Both transactions should use "Transfer : [Account Name]" as payee

### Investment Account Transfer

**Human Request:**
> "I moved $2,000 to my investment account. The brokerage shows it as two separate transactions"

**Claude Code Usage:**
```javascript
ynab_link_transfer({
  budget_id: "budget-id", 
  transaction_id_1: "checking-to-investment-id", // -$2,000 from checking
  transaction_id_2: "investment-inflow-id"       // +$2,000 to investment
})
```

---

## Creating Transfer Transactions

### Manual Transfer Creation

**Human Request:**
> "Create a transfer of $300 from my checking account to savings"

**Step 1: Create outflow transaction (checking account)**
```javascript
ynab_create_transaction({
  budget_id: "budget-id",
  account_id: "checking-account-id",
  payee_name: "Transfer : Savings Account", 
  category_id: null, // No category for transfers
  amount: -300000, // -$300 (money leaving checking)
  date: "2024-01-15",
  memo: "Transfer to savings",
  cleared: "cleared"
})
```

**Step 2: Create inflow transaction (savings account)**
```javascript
ynab_create_transaction({
  budget_id: "budget-id",
  account_id: "savings-account-id", 
  payee_name: "Transfer : Checking Account",
  category_id: null, // No category for transfers
  amount: 300000, // +$300 (money coming into savings)
  date: "2024-01-15",
  memo: "Transfer from checking", 
  cleared: "cleared"
})
```

**Step 3: Link the transactions**
```javascript
ynab_link_transfer({
  budget_id: "budget-id",
  transaction_id_1: "new-checking-transaction-id",
  transaction_id_2: "new-savings-transaction-id" 
})
```

### Split Transaction Transfer

**Human Request:**
> "Create a split transaction where I pay my credit card $500: $300 from checking and $200 from savings"

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
      amount: 300000, // $300 FROM checking (positive inflow to credit card)
      transfer_account_id: "checking-account-id",
      memo: "Primary payment source"
    },
    {
      amount: 200000, // $200 FROM savings (positive inflow to credit card)
      transfer_account_id: "savings-account-id", 
      memo: "Additional payment source"
    }
  ]
})
```

This automatically creates the corresponding transactions in checking (-$300) and savings (-$200) accounts and links them as transfers.

---

## Transfer Unlinking

### Unlink Transfer

**Human Request:**
> "I need to unlink that transfer because I realized it wasn't actually a transfer - I need to categorize them properly"

**Claude Code Usage:**
```javascript
ynab_unlink_transfer({
  budget_id: "budget-id",
  transaction_id: "either-transaction-id" // Can use either transaction in the transfer pair
})
```

**Response:**
```json
{
  "unlinked_transactions": [
    {
      "id": "checking-transaction-id",
      "account_id": "checking-account-id", 
      "transfer_account_id": null, // Cleared
      "transfer_transaction_id": null // Cleared
    },
    {
      "id": "savings-transaction-id",
      "account_id": "savings-account-id",
      "transfer_account_id": null, // Cleared
      "transfer_transaction_id": null // Cleared
    }
  ],
  "success": true
}
```

**After Unlinking:**
- Both transactions become regular transactions
- You can now assign categories to them
- They affect your budget categories instead of being neutral transfers

### Fix Incorrect Transfer Link

**Human Request:**
> "I accidentally linked the wrong transactions as a transfer. Unlink them and link the correct ones"

**Step 1: Unlink incorrect transfer**
```javascript
ynab_unlink_transfer({
  budget_id: "budget-id", 
  transaction_id: "incorrectly-linked-transaction-id"
})
```

**Step 2: Link correct transactions**
```javascript
ynab_link_transfer({
  budget_id: "budget-id",
  transaction_id_1: "correct-transaction-1-id",
  transaction_id_2: "correct-transaction-2-id"
})
```

---

## Transfer Validation

### Validate Transfer Amounts

**Human Request:**
> "Check if these transactions can be linked as a valid transfer before I link them"

**The `ynab_link_transfer` tool provides validation in its response:**

```json
{
  "validation": {
    "amounts_match": true,        // Amounts are equal (opposite signs)
    "dates_match": true,         // Dates are the same or close
    "is_valid_transfer": true    // Overall validation status
  }
}
```

**Common Validation Issues:**

1. **Amounts Don't Match:**
```json
{
  "validation": {
    "amounts_match": false,
    "is_valid_transfer": false
  }
}
```
*Solution:* Check if one transaction includes fees or if amounts were entered incorrectly.

2. **Dates Too Far Apart:**
```json
{
  "validation": {
    "dates_match": false,
    "is_valid_transfer": false  
  }
}
```
*Solution:* Verify the dates are correct or if processing delays caused the difference.

### Handle Transfer Fees

**Human Request:**
> "I transferred $500 but there was a $5 fee. How do I handle this?"

**Scenario:** Checking shows -$505, Savings shows +$500

**Solution 1: Split the outflow transaction**
```javascript
ynab_update_transaction_splits({
  budget_id: "budget-id",
  transaction_id: "checking-transaction-id", // Original -$505 transaction
  subtransactions: [
    {
      amount: -500000, // $500 transfer portion
      transfer_account_id: "savings-account-id",
      memo: "Transfer to savings"
    },
    {
      amount: -5000, // $5 fee portion  
      category_id: "banking-fees-category-id",
      memo: "Transfer fee"
    }
  ]
})
```

**Solution 2: Create separate fee transaction**
```javascript
// Update original transaction to exact transfer amount
ynab_update_transaction({
  budget_id: "budget-id",
  transaction_id: "checking-transaction-id",
  amount: -500000 // Remove fee from transfer amount
})

// Create separate transaction for fee
ynab_create_transaction({
  budget_id: "budget-id", 
  account_id: "checking-account-id",
  payee_name: "Bank Transfer Fee",
  category_id: "banking-fees-category-id",
  amount: -5000,
  date: "2024-01-15",
  memo: "Transfer fee"
})

// Now link the transfer (amounts will match)
ynab_link_transfer({
  budget_id: "budget-id",
  transaction_id_1: "updated-checking-transaction-id", // -$500
  transaction_id_2: "savings-transaction-id"           // +$500
})
```

---

## Common Transfer Scenarios

### Scenario 1: ATM Cash Withdrawal

**Human Request:**
> "I withdrew $100 cash from an ATM. How should I record this?"

**Approach 1: Transfer to Cash Account**
```javascript
// Create cash account if it doesn't exist, then:
ynab_create_transaction({
  budget_id: "budget-id",
  account_id: "checking-account-id",
  payee_name: "Transfer : Cash", 
  category_id: null,
  amount: -100000, // -$100 from checking
  date: "2024-01-15",
  memo: "ATM withdrawal"
})

ynab_create_transaction({
  budget_id: "budget-id",
  account_id: "cash-account-id",
  payee_name: "Transfer : Checking Account",
  category_id: null, 
  amount: 100000, // +$100 to cash
  date: "2024-01-15",
  memo: "ATM withdrawal"
})

// Link as transfer
ynab_link_transfer({
  budget_id: "budget-id", 
  transaction_id_1: "checking-atm-transaction-id",
  transaction_id_2: "cash-inflow-transaction-id"
})
```

**Approach 2: Categorize as Spending**
```javascript
ynab_create_transaction({
  budget_id: "budget-id",
  account_id: "checking-account-id",
  payee_name: "ATM Withdrawal",
  category_id: "cash-spending-category-id", // Budget category for cash
  amount: -100000,
  date: "2024-01-15", 
  memo: "Cash for miscellaneous expenses"
})
```

### Scenario 2: Online Transfer with Delayed Processing

**Human Request:**
> "I initiated a transfer on Monday, but it didn't process until Wednesday. The dates don't match"

**Solution:**
```javascript
// Update one transaction to match the other's date
ynab_update_transaction({
  budget_id: "budget-id",
  transaction_id: "delayed-transaction-id",
  date: "2024-01-15" // Match the initiation date
})

// Then link the transfer
ynab_link_transfer({
  budget_id: "budget-id",
  transaction_id_1: "monday-transaction-id",
  transaction_id_2: "updated-wednesday-transaction-id"
})
```

**Alternative: Keep original dates if preferred**
```javascript
// Link despite date mismatch (validation will show dates_match: false)
ynab_link_transfer({
  budget_id: "budget-id", 
  transaction_id_1: "monday-transaction-id", 
  transaction_id_2: "wednesday-transaction-id"
})
```

### Scenario 3: Mortgage Payment with Principal and Interest

**Human Request:**
> "My mortgage payment is $1,500 total: $1,100 interest and $400 principal. How do I split this?"

**Solution: Split transaction with transfer**
```javascript
ynab_create_split_transaction({
  budget_id: "budget-id",
  account_id: "checking-account-id",
  payee_name: "Mortgage Lender",
  date: "2024-01-15", 
  memo: "Monthly mortgage payment",
  subtransactions: [
    {
      amount: -110000, // $1,100 interest (expense)
      category_id: "mortgage-interest-category-id",
      memo: "Mortgage interest"  
    },
    {
      amount: -40000, // $400 principal (transfer to mortgage account)
      transfer_account_id: "mortgage-account-id",
      memo: "Principal payment"
    }
  ]
})
```

This automatically creates a +$400 transaction in the mortgage account (reducing the mortgage balance) and links it as a transfer.

### Scenario 4: Investment Account Funding

**Human Request:**
> "I'm contributing $1,000 to my 401k from my paycheck. How do I record this?"

**Option 1: If 401k is a tracking account**
```javascript
ynab_create_transaction({
  budget_id: "budget-id",
  account_id: "401k-account-id", // Off-budget tracking account
  payee_name: "401k Contribution", 
  category_id: null, // No category needed for off-budget accounts
  amount: 100000, // +$1,000 to 401k
  date: "2024-01-15",
  memo: "Payroll contribution"
})
```

**Option 2: If tracking as budget category**
```javascript
ynab_create_transaction({
  budget_id: "budget-id",
  account_id: "checking-account-id", // Where paycheck is deposited
  payee_name: "401k Contribution",
  category_id: "retirement-category-id", // Budget category
  amount: -100000, // -$1,000 from checking (or reduce paycheck inflow)
  date: "2024-01-15",
  memo: "Payroll deduction"
})
```

---

## Troubleshooting

### Common Issues and Solutions

**Issue: "Amounts don't match for transfer"**
```json
{
  "error": "Transfer amounts don't match",
  "transaction_1_amount": -50000,
  "transaction_2_amount": 49500
}
```

**Solutions:**
1. Check for fees or service charges
2. Verify data entry accuracy
3. Look for currency conversion (if applicable)
4. Split transaction to separate fees

**Issue: "Transaction already linked to another transfer"**
```json
{
  "error": "Transaction already part of a transfer",
  "transaction_id": "already-linked-transaction-id",
  "existing_transfer_transaction_id": "other-transaction-id"
}
```

**Solution:**
```javascript
// First unlink the existing transfer
ynab_unlink_transfer({
  budget_id: "budget-id",
  transaction_id: "already-linked-transaction-id" 
})

// Then create the new link
ynab_link_transfer({
  budget_id: "budget-id",
  transaction_id_1: "transaction-1-id", 
  transaction_id_2: "transaction-2-id"
})
```

**Issue: "Cannot find matching transaction"**

**Debugging steps:**
1. **Verify transactions exist:**
```javascript
ynab_get_transactions({
  budget_id: "budget-id",
  account_id: "account-id",
  since_date: "2024-01-14"
})
```

2. **Check transaction details:**
   - Are amounts exactly opposite? (-500 and +500)
   - Are accounts different?
   - Are dates close to each other?
   - Are they already linked to other transfers?

3. **Create missing transaction if needed:**
```javascript
ynab_create_transaction({
  budget_id: "budget-id",
  account_id: "missing-account-id", 
  payee_name: "Transfer : Other Account",
  category_id: null,
  amount: 50000, // Matching amount with opposite sign
  date: "2024-01-15"
})
```

### Best Practices

1. **Consistent Payee Names:**
   - Use "Transfer : [Account Name]" format
   - Be consistent across all transfers

2. **Date Management:**
   - Use transaction date, not processing date
   - Adjust dates if processing delays cause issues

3. **Fee Handling:**
   - Always separate fees from transfer amounts
   - Use split transactions when necessary

4. **Validation:**
   - Always check validation results
   - Fix issues before confirming transfers

5. **Documentation:**
   - Use clear memos for transfer purposes
   - Include reference numbers when available

---

Transfer management is crucial for accurate YNAB budgeting. Proper linking ensures your account balances are correct and prevents double-counting of money movement between accounts.