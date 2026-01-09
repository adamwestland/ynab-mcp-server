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

## Linking Existing Transactions as Transfers

### CRITICAL: YNAB Transfer Behavior

**YNAB does NOT have a direct API to link two existing transactions.** When you want to convert existing unlinked transactions into a transfer, you must:

1. **If ONLY one side exists:** Update its `payee_id` to the destination account's `transfer_payee_id`. YNAB will create the matching transaction automatically.

2. **If BOTH sides exist:** You must DELETE one transaction first, then update the remaining one's `payee_id`. If you update without deleting first, YNAB creates a DUPLICATE.

3. **If NEITHER side exists:** Use `ynab_create_transfer` to create both sides at once.

### Linking When One Transaction Exists

**Human Request:**
> "I have a $500 outflow in checking that should be a transfer to savings, but there's no matching transaction in savings yet"

**Step 1: Get the destination account's transfer_payee_id**
```javascript
ynab_get_accounts({
  budget_id: "budget-id"
})
// Find savings account's transfer_payee_id
```

**Step 2: Update the existing transaction**
```javascript
ynab_update_transaction({
  budget_id: "budget-id",
  transaction_id: "checking-outflow-transaction-id",
  payee_id: "savings-transfer-payee-id"  // Use transfer_payee_id from savings account
})
```

YNAB automatically creates the matching +$500 inflow in savings and links both transactions.

### Linking When BOTH Transactions Already Exist

**Human Request:**
> "I have a $500 outflow in checking AND a $500 inflow in savings. They're not linked as a transfer."

**WARNING:** If you just update payee_id when both sides exist, YNAB creates a DUPLICATE.

**Correct approach:**
```javascript
// Step 1: DELETE the inflow transaction first
ynab_delete_transaction({
  budget_id: "budget-id",
  transaction_id: "savings-inflow-transaction-id"
})

// Step 2: Update the outflow's payee to create the linked transfer
ynab_update_transaction({
  budget_id: "budget-id",
  transaction_id: "checking-outflow-transaction-id",
  payee_id: "savings-transfer-payee-id"
})
```

### Credit Card Payment Transfer

**Human Request:**
> "I paid my credit card $1,200 from my checking account. The transactions exist but aren't linked."

**Key Points:**
- Credit card payments reduce the card balance (positive amount on credit card)
- The checking account shows negative amount (money leaving)
- You need the credit card account's `transfer_payee_id`

**If only checking transaction exists:**
```javascript
ynab_update_transaction({
  budget_id: "budget-id",
  transaction_id: "checking-payment-transaction-id",
  payee_id: "credit-card-transfer-payee-id"
})
```

**If both exist:** Delete one first, then update the other.

### Investment Account Transfer

**Human Request:**
> "I moved $2,000 to my investment account. I have transactions in both but they're not linked."

**Correct approach:**
```javascript
// Delete the investment inflow first
ynab_delete_transaction({
  budget_id: "budget-id",
  transaction_id: "investment-inflow-id"
})

// Update checking transaction to create linked transfer
ynab_update_transaction({
  budget_id: "budget-id",
  transaction_id: "checking-to-investment-id",
  payee_id: "investment-transfer-payee-id"
})
```

---

## Creating Transfer Transactions

### Using ynab_create_transfer (Recommended)

**Human Request:**
> "Create a transfer of $300 from my checking account to savings"

**Simple approach using ynab_create_transfer:**
```javascript
ynab_create_transfer({
  budget_id: "budget-id",
  from_account_id: "checking-account-id",
  to_account_id: "savings-account-id",
  amount: 300000,  // $300 in milliunits (positive value)
  date: "2024-01-15",
  memo: "Transfer to savings"
})
```

This creates:
- An outflow (-$300) in checking
- An inflow (+$300) in savings
- Both transactions are automatically linked as a transfer

**WARNING:** This always creates NEW transactions. If matching transactions already exist, you'll create duplicates. Use `ynab_update_transaction` with `payee_id` instead when one side already exists.

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

If only one transaction should become the transfer:
```javascript
ynab_update_transaction({
  budget_id: "budget-id",
  transaction_id: "correct-transaction-id",
  payee_id: "destination-account-transfer-payee-id"
})
```

If BOTH transactions exist and should be linked, delete one first:
```javascript
ynab_delete_transaction({
  budget_id: "budget-id",
  transaction_id: "one-transaction-to-delete"
})

ynab_update_transaction({
  budget_id: "budget-id",
  transaction_id: "remaining-transaction-id",
  payee_id: "destination-account-transfer-payee-id"
})
```

---

## Transfer Validation

### Validate Transfer Candidates

**Human Request:**
> "Check if these transactions can be linked as a valid transfer before I link them"

**Before linking, manually verify:**

1. **Amounts must be equal and opposite** (e.g., -$500 and +$500)
2. **Dates should be close** (within a few days for bank processing)
3. **Different accounts** (can't transfer to same account)
4. **Neither is already linked** to another transfer

**Check existing links:**
```javascript
// Get transaction details
ynab_get_transactions({
  budget_id: "budget-id",
  account_id: "account-id",
  since_date: "2024-01-14"
})
// Check transfer_account_id and transfer_transaction_id fields
// If populated, the transaction is already linked
```

**Common Validation Issues:**

1. **Amounts Don't Match:**
*Solution:* Check if one transaction includes fees or if amounts were entered incorrectly.

2. **Dates Too Far Apart:**
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

// Now link the transfer by updating payee_id
// First, delete the savings transaction if it exists
ynab_delete_transaction({
  budget_id: "budget-id",
  transaction_id: "savings-transaction-id"
})

// Then update checking transaction to create linked transfer
ynab_update_transaction({
  budget_id: "budget-id",
  transaction_id: "updated-checking-transaction-id",
  payee_id: "savings-transfer-payee-id"
})
```

---

## Common Transfer Scenarios

### Scenario 1: ATM Cash Withdrawal

**Human Request:**
> "I withdrew $100 cash from an ATM. How should I record this?"

**Approach 1: Transfer to Cash Account**
```javascript
// Create cash account if it doesn't exist, then use ynab_create_transfer:
ynab_create_transfer({
  budget_id: "budget-id",
  from_account_id: "checking-account-id",
  to_account_id: "cash-account-id",
  amount: 100000,  // $100 in milliunits
  date: "2024-01-15",
  memo: "ATM withdrawal"
})
```
This creates both transactions and links them automatically.

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

**Solution: When BOTH transactions exist:**
```javascript
// Step 1: Delete one transaction
ynab_delete_transaction({
  budget_id: "budget-id",
  transaction_id: "wednesday-transaction-id"  // Delete the delayed one
})

// Step 2: Update the other to create the linked transfer
ynab_update_transaction({
  budget_id: "budget-id",
  transaction_id: "monday-transaction-id",
  payee_id: "destination-account-transfer-payee-id"
})
```

**Alternative: If only one transaction exists:**
```javascript
// Just update the payee_id - YNAB creates the matching transaction
ynab_update_transaction({
  budget_id: "budget-id",
  transaction_id: "existing-transaction-id",
  payee_id: "other-account-transfer-payee-id"
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

// Then create the new link by updating payee_id
// If both transactions exist, delete one first:
ynab_delete_transaction({
  budget_id: "budget-id",
  transaction_id: "one-of-the-transactions"
})

// Update the remaining transaction
ynab_update_transaction({
  budget_id: "budget-id",
  transaction_id: "remaining-transaction-id",
  payee_id: "destination-account-transfer-payee-id"
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