# Scheduled Transactions Examples

This guide demonstrates how to manage recurring transactions using the YNAB MCP Server. Learn to create, update, and manage scheduled transactions for regular income, bills, and automated savings.

## Table of Contents

- [Understanding Scheduled Transactions](#understanding-scheduled-transactions)
- [Creating Scheduled Transactions](#creating-scheduled-transactions)
- [Managing Existing Schedules](#managing-existing-schedules)
- [Frequency Patterns](#frequency-patterns)
- [Common Scenarios](#common-scenarios)
- [Advanced Scheduling](#advanced-scheduling)

---

## Understanding Scheduled Transactions

Scheduled transactions in YNAB represent recurring transactions that happen on a predictable schedule. They help with budget planning and ensure you don't forget regular income or expenses.

### Key Concepts

- **Frequency**: How often the transaction repeats (daily, weekly, monthly, etc.)
- **Date First**: The first occurrence date of the scheduled transaction
- **Amount**: Transaction amount in milliunits (positive for inflows, negative for outflows)
- **Account**: The account where the transaction will occur
- **Category/Payee**: Optional categorization and payee assignment

### Benefits

1. **Budget Planning**: See upcoming transactions in advance
2. **Automation**: Consistent recording of regular transactions
3. **Cash Flow Forecasting**: Predict future account balances
4. **Never Miss Payments**: Visual reminders of upcoming bills

---

## Creating Scheduled Transactions

### Basic Recurring Bill

**Human Request:**
> "Set up my monthly rent payment of $1,200 due on the 1st of each month"

**Claude Code Usage:**
```javascript
ynab_create_scheduled_transaction({
  budget_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  account_id: "checking-account-id",
  payee_name: "Landlord Property Management",
  category_id: "rent-category-id",
  amount: -1200000, // -$1,200 in milliunits (outflow)
  frequency: "monthly",
  date_first: "2024-02-01", // Next occurrence
  memo: "Monthly rent payment"
})
```

**Response:**
```json
{
  "scheduled_transaction": {
    "id": "scheduled-123",
    "date_first": "2024-02-01",
    "frequency": "monthly",
    "amount": {
      "milliunits": -1200000,
      "formatted": "-$1,200.00"
    },
    "memo": "Monthly rent payment",
    "payee_name": "Landlord Property Management",
    "category_name": "Rent",
    "account_name": "Checking Account"
  },
  "upcoming_dates": [
    "2024-02-01",
    "2024-03-01",
    "2024-04-01",
    "2024-05-01",
    "2024-06-01"
  ]
}
```

### Bi-weekly Paycheck

**Human Request:**
> "Schedule my bi-weekly paycheck of $2,800 (after taxes) every other Friday"

**Claude Code Usage:**
```javascript
ynab_create_scheduled_transaction({
  budget_id: "budget-id",
  account_id: "checking-account-id",
  payee_name: "Employer Inc - Payroll",
  category_id: null, // Income doesn't need a category
  amount: 2800000, // +$2,800 (inflow)
  frequency: "everyOtherWeek",
  date_first: "2024-01-19", // Next Friday paycheck
  memo: "Bi-weekly salary deposit",
  flag_color: "green" // Mark as income
})
```

### Quarterly Subscription

**Human Request:**
> "I pay $150 every 3 months for my software subscription"

**Claude Code Usage:**
```javascript
ynab_create_scheduled_transaction({
  budget_id: "budget-id",
  account_id: "credit-card-account-id",
  payee_name: "Software Company",
  category_id: "software-subscriptions-category-id",
  amount: -150000, // -$150
  frequency: "everyThreeMonths",
  date_first: "2024-04-01", // Next billing date
  memo: "Quarterly software subscription"
})
```

### Annual Payment

**Human Request:**
> "Set up my annual car insurance payment of $1,800 due in June"

**Claude Code Usage:**
```javascript
ynab_create_scheduled_transaction({
  budget_id: "budget-id",
  account_id: "checking-account-id", 
  payee_name: "Auto Insurance Company",
  category_id: "car-insurance-category-id",
  amount: -1800000, // -$1,800
  frequency: "yearly",
  date_first: "2024-06-15", // Annual renewal date
  memo: "Annual car insurance premium",
  flag_color: "orange" // Flag for large annual expense
})
```

---

## Managing Existing Schedules

### View All Scheduled Transactions

**Human Request:**
> "Show me all my scheduled transactions so I can review them"

**Claude Code Usage:**
```javascript
ynab_get_scheduled_transactions({
  budget_id: "budget-id",
  include_deleted: false
})
```

**Response Analysis:**
```json
{
  "scheduled_transactions": [
    {
      "id": "scheduled-123",
      "date_first": "2024-02-01",
      "frequency": "monthly",
      "amount": -1200000,
      "payee_name": "Landlord Property Management",
      "category_name": "Rent",
      "account_name": "Checking Account"
    },
    {
      "id": "scheduled-456",
      "date_first": "2024-01-19", 
      "frequency": "everyOtherWeek",
      "amount": 2800000,
      "payee_name": "Employer Inc - Payroll",
      "category_name": null,
      "account_name": "Checking Account"
    }
  ]
}
```

### Get Specific Scheduled Transaction Details

**Human Request:**
> "Show me details about my rent payment schedule including upcoming dates"

**Claude Code Usage:**
```javascript
ynab_get_scheduled_transaction({
  budget_id: "budget-id",
  scheduled_transaction_id: "scheduled-123"
})
```

### Update Scheduled Transaction

**Human Request:**
> "My rent increased to $1,300 starting next month"

**Claude Code Usage:**
```javascript
ynab_update_scheduled_transaction({
  budget_id: "budget-id",
  scheduled_transaction_id: "rent-scheduled-id",
  amount: -1300000, // New rent amount
  memo: "Monthly rent payment - increased Jan 2024"
})
```

**Response:**
```json
{
  "scheduled_transaction": {
    "id": "rent-scheduled-id",
    "amount": {
      "milliunits": -1300000,
      "formatted": "-$1,300.00"
    },
    "memo": "Monthly rent payment - increased Jan 2024"
  },
  "changes_made": ["amount", "memo"],
  "upcoming_dates": [
    "2024-02-01",
    "2024-03-01", 
    "2024-04-01"
  ]
}
```

### Change Schedule Frequency

**Human Request:**
> "I switched from monthly to bi-weekly pay, update my paycheck schedule"

**Claude Code Usage:**
```javascript
ynab_update_scheduled_transaction({
  budget_id: "budget-id",
  scheduled_transaction_id: "paycheck-scheduled-id",
  frequency: "everyOtherWeek",
  amount: 1400000, // Half the monthly amount: $1,400
  date_first: "2024-01-19", // Next bi-weekly payday
  memo: "Bi-weekly paycheck - changed from monthly"
})
```

### Delete Scheduled Transaction

**Human Request:**
> "Cancel the scheduled transaction for my old gym membership"

**Claude Code Usage:**
```javascript
ynab_delete_scheduled_transaction({
  budget_id: "budget-id",
  scheduled_transaction_id: "gym-membership-id"
})
```

---

## Frequency Patterns

### Understanding Frequency Options

**Available Frequencies:**
- `never` - One-time transaction (not really recurring)
- `daily` - Every day
- `weekly` - Every week
- `everyOtherWeek` - Every two weeks (bi-weekly)
- `twiceAMonth` - Twice per month (e.g., 1st and 15th)
- `monthly` - Every month
- `everyOtherMonth` - Every two months (bi-monthly)
- `everyThreeMonths` - Every three months (quarterly)
- `everyFourMonths` - Every four months
- `twiceAYear` - Twice per year (semi-annually)
- `yearly` - Once per year (annually)

### Common Frequency Use Cases

**Weekly (weekly):**
- Grocery shopping budget
- Weekly allowances
- Regular services (lawn care, cleaning)

**Bi-weekly (everyOtherWeek):**
- Most common payroll schedule
- Mortgage payments (26 payments/year)
- Some subscription services

**Twice Monthly (twiceAMonth):**
- Alternative payroll schedule (24 payments/year)
- Some utility bills
- Semi-monthly savings transfers

**Monthly (monthly):**
- Most bills and subscriptions
- Rent/mortgage payments
- Monthly savings goals

**Quarterly (everyThreeMonths):**
- Estimated tax payments
- Some insurance payments
- Seasonal services

**Annually (yearly):**
- Insurance renewals
- Professional license fees
- Annual subscriptions

### Advanced Frequency Patterns

**Seasonal Services:**
```javascript
// Winter heating bill (higher amounts Oct-Mar)
ynab_create_scheduled_transaction({
  budget_id: "budget-id",
  account_id: "checking-account-id",
  payee_name: "Gas Company",
  category_id: "utilities-category-id",
  amount: -180000, // $180 for winter months
  frequency: "monthly",
  date_first: "2024-10-15",
  memo: "Higher winter heating bill"
})

// Summer cooling bill (higher amounts Jun-Sep) 
ynab_create_scheduled_transaction({
  budget_id: "budget-id",
  account_id: "checking-account-id", 
  payee_name: "Electric Company",
  category_id: "utilities-category-id",
  amount: -220000, // $220 for summer months
  frequency: "monthly",
  date_first: "2024-06-15",
  memo: "Higher summer cooling bill"
})
```

**Note:** For truly seasonal patterns, you may need to create multiple scheduled transactions with different start/end periods and manage them manually.

---

## Common Scenarios

### Complete Monthly Budget Setup

**Human Request:**
> "Set up all my regular monthly bills and income as scheduled transactions"

**Income:**
```javascript
// Salary
ynab_create_scheduled_transaction({
  budget_id: "budget-id",
  account_id: "checking-account-id",
  payee_name: "Primary Employer",
  amount: 5000000, // $5,000
  frequency: "monthly", 
  date_first: "2024-02-01"
})

// Side income
ynab_create_scheduled_transaction({
  budget_id: "budget-id",
  account_id: "checking-account-id",
  payee_name: "Freelance Client",
  amount: 800000, // $800
  frequency: "monthly",
  date_first: "2024-02-15" 
})
```

**Fixed Expenses:**
```javascript
// Rent
ynab_create_scheduled_transaction({
  budget_id: "budget-id", 
  account_id: "checking-account-id",
  payee_name: "Property Manager",
  category_id: "rent-category-id",
  amount: -1800000, // $1,800
  frequency: "monthly",
  date_first: "2024-02-01"
})

// Phone bill
ynab_create_scheduled_transaction({
  budget_id: "budget-id",
  account_id: "checking-account-id",
  payee_name: "Mobile Carrier",
  category_id: "phone-category-id", 
  amount: -85000, // $85
  frequency: "monthly",
  date_first: "2024-02-12"
})

// Car payment
ynab_create_scheduled_transaction({
  budget_id: "budget-id",
  account_id: "checking-account-id",
  payee_name: "Auto Loan Company",
  category_id: "car-payment-category-id",
  amount: -320000, // $320
  frequency: "monthly", 
  date_first: "2024-02-05"
})
```

**Automated Savings:**
```javascript
// Emergency fund
ynab_create_scheduled_transaction({
  budget_id: "budget-id",
  account_id: "checking-account-id",
  payee_name: "Transfer : Savings Account", 
  category_id: null, // Transfer
  amount: -500000, // $500
  frequency: "monthly",
  date_first: "2024-02-02"
})

// Investment contribution
ynab_create_scheduled_transaction({
  budget_id: "budget-id",
  account_id: "checking-account-id",
  payee_name: "Investment Company",
  category_id: "investments-category-id",
  amount: -1000000, // $1,000
  frequency: "monthly",
  date_first: "2024-02-03"
})
```

### Credit Card Payment Automation

**Human Request:**
> "Set up automatic minimum payments for my three credit cards"

```javascript
// Card 1 - Minimum payment
ynab_create_scheduled_transaction({
  budget_id: "budget-id",
  account_id: "credit-card-1-account-id",
  payee_name: "Transfer : Checking Account",
  category_id: null, // Transfer
  amount: 75000, // $75 minimum payment (positive = payment to card)
  frequency: "monthly",
  date_first: "2024-02-15",
  memo: "Minimum payment - Card 1"
})

// Card 2 - Higher payment to pay down faster
ynab_create_scheduled_transaction({
  budget_id: "budget-id", 
  account_id: "credit-card-2-account-id",
  payee_name: "Transfer : Checking Account",
  category_id: null,
  amount: 200000, // $200 payment 
  frequency: "monthly",
  date_first: "2024-02-20",
  memo: "Accelerated payment - Card 2"
})
```

### Subscription Management

**Human Request:**
> "Track all my subscription services with their different billing cycles"

```javascript
// Netflix (monthly)
ynab_create_scheduled_transaction({
  budget_id: "budget-id",
  account_id: "credit-card-account-id",
  payee_name: "Netflix", 
  category_id: "streaming-category-id",
  amount: -15000, // $15
  frequency: "monthly",
  date_first: "2024-02-08"
})

// Spotify (monthly)
ynab_create_scheduled_transaction({
  budget_id: "budget-id",
  account_id: "credit-card-account-id",
  payee_name: "Spotify",
  category_id: "streaming-category-id",
  amount: -10000, // $10
  frequency: "monthly", 
  date_first: "2024-02-12"
})

// Amazon Prime (yearly)
ynab_create_scheduled_transaction({
  budget_id: "budget-id",
  account_id: "credit-card-account-id",
  payee_name: "Amazon Prime",
  category_id: "streaming-category-id",
  amount: -139000, // $139
  frequency: "yearly",
  date_first: "2024-03-15"
})

// Software subscription (quarterly)
ynab_create_scheduled_transaction({
  budget_id: "budget-id", 
  account_id: "credit-card-account-id",
  payee_name: "Adobe Creative Suite",
  category_id: "software-category-id",
  amount: -60000, // $60
  frequency: "everyThreeMonths",
  date_first: "2024-03-01"
})
```

---

## Advanced Scheduling

### Variable Amount Scheduling

**Human Request:**
> "My utility bill varies but I want to track it as scheduled. How do I handle the amount changes?"

**Approach 1: Average Amount with Adjustments**
```javascript
// Create with average amount
ynab_create_scheduled_transaction({
  budget_id: "budget-id",
  account_id: "checking-account-id",
  payee_name: "Electric Company",
  category_id: "utilities-category-id",
  amount: -120000, // $120 average
  frequency: "monthly", 
  date_first: "2024-02-15",
  memo: "Electric bill - average amount, adjust actual"
})

// When actual bill comes, update if significantly different
ynab_update_scheduled_transaction({
  budget_id: "budget-id",
  scheduled_transaction_id: "electric-bill-id",
  amount: -135000, // $135 actual this month
  memo: "Electric bill - updated for seasonal increase"
})
```

**Approach 2: Seasonal Variations**
```javascript
// Winter schedule (Oct-Mar)
ynab_create_scheduled_transaction({
  budget_id: "budget-id",
  account_id: "checking-account-id",
  payee_name: "Gas Company - Winter",
  category_id: "utilities-category-id",
  amount: -180000, // $180
  frequency: "monthly",
  date_first: "2024-10-15"
})

// Summer schedule (Apr-Sep) - create separately and manage timing
ynab_create_scheduled_transaction({
  budget_id: "budget-id",
  account_id: "checking-account-id", 
  payee_name: "Gas Company - Summer",
  category_id: "utilities-category-id",
  amount: -80000, // $80
  frequency: "monthly",
  date_first: "2024-04-15"
})
```

### Income with Bonuses

**Human Request:**
> "I get regular salary plus quarterly bonuses. How do I schedule both?"

```javascript
// Regular monthly salary
ynab_create_scheduled_transaction({
  budget_id: "budget-id",
  account_id: "checking-account-id",
  payee_name: "Employer - Salary",
  amount: 4500000, // $4,500 base salary
  frequency: "monthly",
  date_first: "2024-02-01"
})

// Quarterly bonus (estimated)
ynab_create_scheduled_transaction({
  budget_id: "budget-id", 
  account_id: "checking-account-id",
  payee_name: "Employer - Bonus",
  amount: 2000000, // $2,000 estimated bonus
  frequency: "everyThreeMonths",
  date_first: "2024-03-31", // End of Q1
  memo: "Quarterly performance bonus - estimated"
})
```

### Multiple Payment Methods

**Human Request:**
> "I split some bills between accounts. How do I schedule that?"

**Option 1: Separate scheduled transactions per account**
```javascript
// Rent - 70% from checking
ynab_create_scheduled_transaction({
  budget_id: "budget-id",
  account_id: "checking-account-id",
  payee_name: "Rent - Checking Portion",
  category_id: "rent-category-id",
  amount: -1260000, // $1,260 (70% of $1,800)
  frequency: "monthly",
  date_first: "2024-02-01"
})

// Rent - 30% from savings  
ynab_create_scheduled_transaction({
  budget_id: "budget-id",
  account_id: "savings-account-id", 
  payee_name: "Rent - Savings Portion",
  category_id: "rent-category-id",
  amount: -540000, // $540 (30% of $1,800)
  frequency: "monthly",
  date_first: "2024-02-01"
})
```

**Option 2: One primary payment, scheduled transfer**
```javascript
// Full rent from checking
ynab_create_scheduled_transaction({
  budget_id: "budget-id",
  account_id: "checking-account-id",
  payee_name: "Property Management",
  category_id: "rent-category-id", 
  amount: -1800000, // $1,800 full amount
  frequency: "monthly",
  date_first: "2024-02-01"
})

// Monthly transfer from savings to checking to cover portion
ynab_create_scheduled_transaction({
  budget_id: "budget-id",
  account_id: "checking-account-id",
  payee_name: "Transfer : Savings Account",
  category_id: null, // Transfer
  amount: 540000, // $540 from savings
  frequency: "monthly", 
  date_first: "2024-01-31" // Day before rent
})
```

---

## Best Practices

### Setup Strategy

1. **Start with Fixed Amounts:**
   - Begin with truly fixed bills (rent, loan payments)
   - Add variable bills with average amounts
   - Include regular income sources

2. **Use Consistent Naming:**
   - Clear payee names that match actual payees
   - Consistent memo formats
   - Descriptive names for similar transactions

3. **Strategic Timing:**
   - Schedule income before expenses when possible
   - Group related transactions near each other
   - Consider cash flow timing

### Maintenance Routine

**Monthly Review:**
- Check upcoming scheduled transactions
- Update amounts for variable bills
- Add new recurring transactions
- Remove cancelled services

**Quarterly Review:**
- Review all scheduled transactions for accuracy
- Update amounts based on actual patterns
- Adjust frequencies if billing cycles change
- Clean up unused or outdated schedules

**Annual Review:**
- Complete review of all scheduled transactions
- Update for annual increases (rent, insurance)
- Add new annual transactions
- Archive or delete old schedules

### Integration with Budget Planning

**Use Scheduled Transactions for:**
- Cash flow forecasting
- Budget planning for irregular expenses
- Identifying funding gaps
- Planning major purchases around scheduled payments

**Coordinate with Categories:**
- Ensure scheduled transaction categories are adequately funded
- Use scheduled amounts for budget planning
- Track actual vs. scheduled for accuracy

---

Scheduled transactions are a powerful tool for automating your budget tracking and ensuring consistent recording of regular financial activities. They work best when combined with regular review and adjustment to maintain accuracy.