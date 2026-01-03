# Budget Management Examples

This guide demonstrates advanced budget management operations using the YNAB MCP Server. Learn how to effectively manage categories, allocate funds, track goals, and maintain a healthy budget structure.

## Table of Contents

- [Category Management](#category-management)
- [Budget Allocation](#budget-allocation)
- [Goal Tracking](#goal-tracking)
- [Monthly Budget Review](#monthly-budget-review)
- [Budget Planning](#budget-planning)
- [Category Analysis](#category-analysis)

---

## Category Management

### View All Categories with Current Status

**Human Request:**
> "Show me all my budget categories with their current balances and activity"

**Claude Code Usage:**
```javascript
ynab_get_categories({
  budget_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  include_hidden: false
})
```

**Response Analysis:**
The response will show category groups and individual categories with:
- `budgeted`: Amount allocated this month (in milliunits)
- `activity`: Actual spending this month (usually negative for outflows)
- `balance`: Available balance (budgeted + activity from previous months)
- `goal_type`: Type of goal set for the category
- `goal_target`: Target amount for the goal

**Example Interpretation:**
```json
{
  "category": {
    "name": "Groceries",
    "budgeted": 400000,      // $400.00 budgeted this month
    "activity": -325000,     // $325.00 spent this month
    "balance": 175000,       // $175.00 remaining (+$100 carried from last month)
    "goal_type": "NEED",
    "goal_target": 400000
  }
}
```

### Analyze Category Performance

**Human Request:**
> "Show me detailed information about my grocery category with spending history"

**Claude Code Usage:**
```javascript
ynab_get_category({
  budget_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  category_id: "grocery-category-id",
  include_history: true,
  history_months: 12
})
```

**What to Look For:**
- **Trend Analysis**: Is spending increasing or decreasing over time?
- **Seasonal Patterns**: Are there months with consistently higher/lower spending?
- **Budget vs. Actual**: How close is actual spending to budgeted amounts?
- **Goal Progress**: If there's a goal, is it being met?

---

## Budget Allocation

### Allocate Budget to a Category

**Human Request:**
> "I want to budget $500 for groceries this month"

**Claude Code Usage:**
```javascript
ynab_update_category_budget({
  budget_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  month: "2024-01-01", // First day of the month
  category_id: "grocery-category-id",
  budgeted: 500000 // $500.00 in milliunits
})
```

**Response Interpretation:**
```json
{
  "category": {
    "name": "Groceries",
    "budgeted": {
      "milliunits": 500000,
      "formatted": "$500.00"
    },
    "balance": {
      "milliunits": 500000,
      "formatted": "$500.00"
    }
  },
  "month": {
    "to_be_budgeted": {
      "milliunits": -500000,
      "formatted": "-$500.00"
    }
  },
  "change": {
    "previous_budgeted": {
      "milliunits": 400000,
      "formatted": "$400.00"
    },
    "difference": {
      "milliunits": 100000,
      "formatted": "$100.00"
    }
  }
}
```

**Key Points:**
- The allocation reduces your "To Be Budgeted" amount
- Shows the previous amount and the change made
- Updates the category balance immediately

### Bulk Budget Adjustments

**Human Request:**
> "I need to increase my food budget by $100, entertainment by $50, and reduce clothing by $75 to balance it out"

This requires multiple calls to `ynab_update_category_budget()`:

**Step 1: Increase Food Budget**
```javascript
ynab_update_category_budget({
  budget_id: "budget-id",
  month: "2024-01-01",
  category_id: "food-category-id",
  budgeted: 600000 // New total amount
})
```

**Step 2: Increase Entertainment**
```javascript
ynab_update_category_budget({
  budget_id: "budget-id", 
  month: "2024-01-01",
  category_id: "entertainment-category-id",
  budgeted: 200000 // New total amount
})
```

**Step 3: Reduce Clothing**
```javascript
ynab_update_category_budget({
  budget_id: "budget-id",
  month: "2024-01-01", 
  category_id: "clothing-category-id",
  budgeted: 75000 // Reduced amount
})
```

**Net Effect:** +$100 + $50 - $75 = +$75 net increase, reduces "To Be Budgeted" by $75

---

## Goal Tracking

### Categories with Goals

**Understanding Goal Types:**

1. **Target Balance (`TB`)**: Save up to a specific amount
2. **Target Balance by Date (`TBD`)**: Save up to an amount by a specific date
3. **Monthly Funding (`MF`)**: Add a specific amount each month
4. **Plan Your Spending (`NEED`)**: Budget a specific amount monthly for spending
5. **Debt Payoff (`DEBT`)**: Pay off debt by a target date

### Analyzing Goal Progress

**Human Request:**
> "Show me all my categories with goals and their progress"

**Claude Code Usage:**
```javascript
ynab_get_categories({
  budget_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
})
```

**Goal Analysis Example:**
```json
{
  "category": {
    "name": "Emergency Fund",
    "balance": 2500000,
    "goal_type": "TB",
    "goal_target": 5000000,
    "goal_percentage_complete": 50,
    "goal_months_to_budget": 10,
    "goal_under_funded": 2500000
  }
}
```

**Interpretation:**
- Target: $5,000 emergency fund
- Current: $2,500 (50% complete)
- Need: $2,500 more
- Timeline: 10 months at current pace

### Funding Goals Strategically

**Human Request:**
> "I have $800 to allocate. Help me prioritize my goals - emergency fund, vacation, and car maintenance"

This scenario would involve:

1. **Check current goal status:**
```javascript
ynab_get_categories({
  budget_id: "budget-id"
})
```

2. **Analyze priorities:**
   - Emergency Fund: Most important, fund first
   - Car Maintenance: Essential, fund second  
   - Vacation: Nice-to-have, fund with remainder

3. **Strategic allocation:**
```javascript
// Emergency fund first priority - needs $500 to reach target
ynab_update_category_budget({
  budget_id: "budget-id",
  month: "2024-01-01",
  category_id: "emergency-fund-id",
  budgeted: 500000
})

// Car maintenance - needs $200 to reach target
ynab_update_category_budget({
  budget_id: "budget-id", 
  month: "2024-01-01",
  category_id: "car-maintenance-id",
  budgeted: 200000
})

// Vacation gets remaining $100
ynab_update_category_budget({
  budget_id: "budget-id",
  month: "2024-01-01", 
  category_id: "vacation-id",
  budgeted: 100000
})
```

---

## Monthly Budget Review

### Complete Monthly Review

**Human Request:**
> "Give me a complete review of this month's budget - what's overspent, what's underspent, and what needs attention"

**Claude Code Usage:**
```javascript
ynab_get_budget_month({
  budget_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  month: "2024-01-01",
  include_categories: true
})
```

**Analysis Points:**

1. **Overspent Categories** (negative balance):
```json
{
  "category": {
    "name": "Dining Out", 
    "budgeted": 150000,
    "activity": -200000,
    "balance": -50000  // $50 overspent
  }
}
```

2. **Underspent Categories** (large positive balance):
```json
{
  "category": {
    "name": "Utilities",
    "budgeted": 200000, 
    "activity": -125000,
    "balance": 75000  // $75 under budget
  }
}
```

3. **Goal Categories Behind Schedule**:
```json
{
  "category": {
    "name": "Emergency Fund",
    "goal_under_funded": 100000  // $100 behind target
  }
}
```

### Budget Rebalancing

**Human Request:**
> "I overspent on dining out by $50 and underspent on utilities by $75. Help me rebalance for next month"

**Strategy:**
1. **Analyze the overspending pattern** - is this a one-time event or trend?
2. **Reallocate from underspent categories**
3. **Adjust next month's budget**

**Next Month Adjustments:**
```javascript
// Increase dining out budget based on actual spending pattern
ynab_update_category_budget({
  budget_id: "budget-id",
  month: "2024-02-01", // Next month
  category_id: "dining-out-id", 
  budgeted: 200000 // Increased from $150 to $200
})

// Reduce utilities budget based on actual usage
ynab_update_category_budget({
  budget_id: "budget-id",
  month: "2024-02-01",
  category_id: "utilities-id",
  budgeted: 175000 // Reduced from $200 to $175
})
```

---

## Budget Planning

### Future Month Planning

**Human Request:**
> "Help me plan my budget for next month. I'm expecting a $500 bonus and have some irregular expenses coming up"

**Planning Process:**

1. **Review current month patterns:**
```javascript
ynab_get_budget_month({
  budget_id: "budget-id",
  month: "2024-01-01",
  include_categories: true  
})
```

2. **Copy successful allocations to next month:**
```javascript
// Copy categories that worked well
ynab_update_category_budget({
  budget_id: "budget-id",
  month: "2024-02-01",
  category_id: "groceries-id",
  budgeted: 400000 // Same as this month
})
```

3. **Plan for irregular expenses:**
```javascript
// Car registration due next month
ynab_update_category_budget({
  budget_id: "budget-id", 
  month: "2024-02-01",
  category_id: "car-registration-id",
  budgeted: 150000 // $150 for annual registration
})
```

4. **Allocate bonus strategically:**
   - Emergency fund: $200
   - Vacation fund: $150  
   - Home maintenance: $150

### Seasonal Budget Adjustments

**Human Request:**
> "It's December - help me adjust my budget for holiday expenses and year-end planning"

**Seasonal Considerations:**

1. **Increase seasonal categories:**
```javascript
// Gifts and holiday spending
ynab_update_category_budget({
  budget_id: "budget-id",
  month: "2024-12-01", 
  category_id: "gifts-id",
  budgeted: 800000 // $800 for holiday gifts
})

// Holiday food and entertaining
ynab_update_category_budget({
  budget_id: "budget-id",
  month: "2024-12-01",
  category_id: "holiday-food-id", 
  budgeted: 300000 // $300 for holiday meals
})
```

2. **Reduce other discretionary spending:**
```javascript
// Reduce dining out to accommodate holiday spending
ynab_update_category_budget({
  budget_id: "budget-id",
  month: "2024-12-01",
  category_id: "dining-out-id",
  budgeted: 100000 // Reduced from $200 to $100
})
```

---

## Category Analysis

### Category Performance Metrics

**Human Request:**
> "Which of my categories are consistently over or under budget, and what should I adjust?"

**Analysis Approach:**

1. **Get historical data for key categories:**
```javascript
ynab_get_category({
  budget_id: "budget-id", 
  category_id: "category-id",
  include_history: true,
  history_months: 6
})
```

2. **Calculate performance metrics:**
   - **Accuracy Rate**: How often actual spending matches budget
   - **Average Variance**: Typical over/under amount
   - **Trend**: Increasing, stable, or decreasing spending

**Example Analysis:**
```javascript
// Dining Out Category - Last 6 months
History: [
  { month: "2024-01", budgeted: 150000, activity: -200000 }, // -$50 over
  { month: "2024-02", budgeted: 150000, activity: -175000 }, // -$25 over  
  { month: "2024-03", budgeted: 175000, activity: -180000 }, // -$5 over
  { month: "2024-04", budgeted: 175000, activity: -165000 }, // +$10 under
  { month: "2024-05", budgeted: 175000, activity: -190000 }, // -$15 over
  { month: "2024-06", budgeted: 175000, activity: -185000 }  // -$10 over
]

// Analysis:
// - Consistently spending more than budgeted
// - Average spending: $182.50
// - Recommended budget: $185-$190
```

**Recommendation:**
```javascript
ynab_update_category_budget({
  budget_id: "budget-id",
  month: "2024-07-01",
  category_id: "dining-out-id", 
  budgeted: 190000 // Adjusted to $190 based on actual patterns
})
```

### Zero-Based Budget Review

**Human Request:**
> "Help me do a zero-based budget review - question every category and optimize allocations"

**Process:**

1. **List all categories with current allocations:**
```javascript
ynab_get_categories({
  budget_id: "budget-id"
})
```

2. **Question each category:**
   - **Essential**: Rent, utilities, groceries, insurance
   - **Important**: Emergency fund, debt payments, transportation  
   - **Discretionary**: Entertainment, dining out, hobbies
   - **Questionable**: Categories with little or no activity

3. **Reallocate based on priorities:**
```javascript
// Reduce low-value discretionary spending
ynab_update_category_budget({
  budget_id: "budget-id",
  month: "next-month",
  category_id: "subscription-services-id",
  budgeted: 50000 // Reduced from $75 to $50
})

// Increase high-priority goals
ynab_update_category_budget({
  budget_id: "budget-id", 
  month: "next-month",
  category_id: "emergency-fund-id",
  budgeted: 300000 // Increased from $250 to $300
})
```

### Category Consolidation

**Human Request:**
> "I have too many similar categories. Help me identify which ones to consolidate"

**Analysis Approach:**

1. **Identify categories with similar purposes:**
   - Multiple food categories (groceries, restaurants, fast food)
   - Multiple entertainment categories (movies, streaming, games)
   - Multiple transportation categories (gas, maintenance, tolls)

2. **Review transaction patterns:**
```javascript
ynab_get_transactions({
  budget_id: "budget-id",
  category_id: "fast-food-id",
  since_date: "2024-01-01"
})
```

3. **Consolidation recommendations:**
   - Combine "Fast Food" and "Dining Out" into "Food & Dining"
   - Merge multiple streaming services into "Entertainment"
   - Combine car expenses into "Transportation"

**Implementation:**
Move money from categories being eliminated:
```javascript
// Zero out the category being eliminated
ynab_update_category_budget({
  budget_id: "budget-id",
  month: "current-month",
  category_id: "fast-food-id", 
  budgeted: 0
})

// Add to the consolidated category  
ynab_update_category_budget({
  budget_id: "budget-id",
  month: "current-month", 
  category_id: "dining-out-id",
  budgeted: 250000 // Combined amount
})
```

---

## Advanced Budget Strategies

### Envelope Method Implementation

**Human Request:**
> "Help me implement a strict envelope budgeting method where I can't overspend any category"

**Strategy:**
1. **Set conservative budget amounts** based on historical minimums
2. **Use category balances as hard limits**
3. **Pre-fund irregular expenses**

### Percentage-Based Budgeting

**Human Request:**
> "I want to allocate my income using percentages: 50% needs, 30% wants, 20% savings"

**Implementation:**
```javascript
// Assume monthly income of $5000 ($5,000,000 milliunits)
const monthlyIncome = 5000000;

// Needs (50% = $2500)
const needsAmount = monthlyIncome * 0.50;
// Allocate across: rent, utilities, groceries, insurance, etc.

// Wants (30% = $1500)  
const wantsAmount = monthlyIncome * 0.30;
// Allocate across: dining out, entertainment, hobbies, etc.

// Savings (20% = $1000)
const savingsAmount = monthlyIncome * 0.20;
// Allocate across: emergency fund, retirement, vacation, etc.
```

### Sinking Funds Strategy

**Human Request:**
> "Set up sinking funds for irregular expenses like car maintenance, home repairs, and annual subscriptions"

**Setup Process:**

1. **Identify annual irregular expenses:**
   - Car maintenance: $1,200/year = $100/month
   - Home repairs: $2,400/year = $200/month  
   - Annual subscriptions: $600/year = $50/month

2. **Create monthly funding:**
```javascript
ynab_update_category_budget({
  budget_id: "budget-id",
  month: "current-month",
  category_id: "car-maintenance-fund-id",
  budgeted: 100000 // $100/month
})

ynab_update_category_budget({
  budget_id: "budget-id", 
  month: "current-month",
  category_id: "home-repair-fund-id",
  budgeted: 200000 // $200/month
})
```

3. **Track progress toward annual targets:**
   - Use goal tracking to monitor sinking fund progress
   - Adjust monthly contributions based on actual expenses

---

This comprehensive guide covers the essential aspects of budget management using the YNAB MCP Server. The key is to use these tools consistently and adapt your budget based on actual spending patterns and changing priorities.