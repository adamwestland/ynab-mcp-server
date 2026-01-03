# Spending Analysis & Allocation Examples

This guide demonstrates the analysis and allocation features of the YNAB MCP Server. Learn how to use pattern-based algorithms for budget recommendations, spending analysis, and automated fund distribution.

## Table of Contents

- [Category Allocation Recommendations](#category-allocation-recommendations)
- [Spending Pattern Analysis](#spending-pattern-analysis)
- [Automated Fund Distribution](#automated-fund-distribution)
- [Budget Optimization Strategies](#budget-optimization-strategies)
- [Advanced Analytics](#advanced-analytics)
- [Goal-Based Planning](#goal-based-planning)

---

## Category Allocation Recommendations

### Basic Allocation Recommendations

**Human Request:**
> "I have $800 to allocate to my budget categories. Give me recommendations based on my spending patterns"

**Claude Code Usage:**
```javascript
ynab_recommend_category_allocation({
  budget_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  strategy: "balanced",
  analysis_months: 6,
  available_funds: 800000, // $800 in milliunits
  include_hidden: false
})
```

**Response Analysis:**
```json
{
  "recommendations": [
    {
      "category_id": "emergency-fund-id",
      "category_name": "Emergency Fund",
      "current_budgeted": {
        "milliunits": 200000,
        "formatted": "$200.00"
      },
      "recommended_amount": {
        "milliunits": 400000,
        "formatted": "$400.00"
      },
      "allocation_difference": {
        "milliunits": 200000,
        "formatted": "$200.00",
        "percentage_change": 100.0
      },
      "priority": "emergency",
      "confidence": 95,
      "reasoning": [
        "Emergency fund is only 30% of target amount",
        "High priority for financial stability",
        "Consistent goal progress over past 6 months"
      ],
      "goal_info": {
        "goal_type": "Target Balance",
        "goal_target": {
          "milliunits": 5000000,
          "formatted": "$5,000.00"
        },
        "monthly_funding_needed": {
          "milliunits": 200000,
          "formatted": "$200.00"
        },
        "progress_percentage": 30
      }
    },
    {
      "category_id": "groceries-id", 
      "category_name": "Groceries",
      "current_budgeted": {
        "milliunits": 400000,
        "formatted": "$400.00"
      },
      "recommended_amount": {
        "milliunits": 450000,
        "formatted": "$450.00"
      },
      "allocation_difference": {
        "milliunits": 50000,
        "formatted": "$50.00",
        "percentage_change": 12.5
      },
      "priority": "essential",
      "confidence": 88,
      "reasoning": [
        "Average monthly spending: $435",
        "Consistently overspent by 8% in past 3 months",
        "Essential category requiring adequate funding"
      ],
      "spending_pattern": {
        "monthly_average": {
          "milliunits": 435000,
          "formatted": "$435.00"
        },
        "predictability_score": 85,
        "trend": "stable"
      }
    }
  ],
  "summary": {
    "strategy_used": "balanced",
    "total_categories_analyzed": 15,
    "total_recommended": {
      "milliunits": 800000,
      "formatted": "$800.00"
    },
    "priority_breakdown": {
      "emergency": 3,
      "essential": 8,
      "important": 3,
      "discretionary": 1
    },
    "average_confidence": 89
  }
}
```

### Strategy-Based Recommendations

**Goals-First Strategy:**
```javascript
ynab_recommend_category_allocation({
  budget_id: "budget-id",
  strategy: "goals_first",
  analysis_months: 12,
  available_funds: 1000000, // $1,000
  emergency_fund_target: 5000000 // $5,000 emergency fund target
})
```

**Essential-First Strategy:**
```javascript
ynab_recommend_category_allocation({
  budget_id: "budget-id",
  strategy: "essential_first", 
  analysis_months: 6,
  available_funds: 600000 // $600
})
```

**Proportional Strategy:**
```javascript
ynab_recommend_category_allocation({
  budget_id: "budget-id",
  strategy: "proportional",
  analysis_months: 3,
  available_funds: 500000 // $500
})
```

### Specific Category Analysis

**Human Request:**
> "Focus the allocation recommendations on just my savings categories and debt payments"

**Claude Code Usage:**
```javascript
ynab_recommend_category_allocation({
  budget_id: "budget-id",
  strategy: "goals_first",
  analysis_months: 12,
  available_funds: 1200000, // $1,200
  category_ids: [
    "emergency-fund-id",
    "vacation-savings-id", 
    "car-replacement-id",
    "credit-card-payment-id",
    "student-loan-payment-id"
  ]
})
```

### Understanding Allocation Strategies

**Balanced Strategy:**
- 40% to goal categories based on target dates
- 35% to essential categories based on spending patterns
- 15% to underfunded categories
- 10% to discretionary categories

**Goals-First Strategy:**
- 70% to categories with specific goals
- 20% to essential underfunded categories
- 10% to maintain minimum balances

**Essential-First Strategy:**
- 60% to essential categories (food, housing, transportation)
- 25% to emergency fund and debt payments
- 15% to other goals and discretionary

**Proportional Strategy:**
- Allocates based on historical spending proportions
- Adjusts for categories consistently over/under budget
- Maintains established spending patterns

---

## Spending Pattern Analysis

### Comprehensive Spending Analysis

**Human Request:**
> "Analyze my spending patterns for the last year and identify opportunities to save money"

**Claude Code Usage:**
```javascript
ynab_analyze_spending_patterns({
  budget_id: "budget-id",
  analysis_months: 12,
  include_forecasting: true,
  include_anomaly_detection: true,
  include_seasonal_analysis: true,
  grouping: "category"
})
```

**Key Insights from Response:**

```json
{
  "spending_summary": {
    "total_outflow": {
      "milliunits": -480000000,
      "formatted": "-$48,000.00"
    },
    "average_monthly": {
      "milliunits": -4000000,
      "formatted": "-$4,000.00"
    },
    "total_transactions": 1247,
    "unique_payees": 89,
    "active_categories": 23
  },
  "category_analysis": [
    {
      "category_name": "Dining Out",
      "total_spent": {
        "milliunits": -36000000,
        "formatted": "-$3,600.00"
      },
      "percentage_of_total": 7.5,
      "monthly_average": {
        "milliunits": -300000,
        "formatted": "-$300.00"
      },
      "predictability_score": 62, // Somewhat unpredictable
      "trend": "increasing",
      "trend_percentage": 15.2, // 15% increase over the period
      "anomalies": [
        {
          "date": "2024-01-15",
          "amount": {
            "milliunits": -85000,
            "formatted": "-$85.00"
          },
          "deviation_score": 2.8, // Very unusual
          "payee_name": "Expensive Restaurant",
          "memo": "Special celebration dinner"
        }
      ]
    }
  ],
  "insights": [
    {
      "type": "opportunity",
      "title": "Dining Out Spending Trend",
      "description": "Dining out spending has increased 15% over the past year, now averaging $300/month",
      "impact": "high",
      "potential_savings": {
        "milliunits": 1200000,
        "formatted": "$1,200.00"
      },
      "recommendation": "Consider setting a firm dining out budget of $250/month and meal planning"
    },
    {
      "type": "warning", 
      "title": "Irregular Grocery Spending",
      "description": "Grocery spending varies by 40% month-to-month, indicating possible planning issues",
      "impact": "medium",
      "recommendation": "Implement weekly meal planning and consistent shopping schedule"
    }
  ],
  "forecasting": {
    "next_month_predicted": {
      "milliunits": -4150000,
      "formatted": "-$4,150.00"
    },
    "confidence": 78,
    "category_predictions": [
      {
        "category_name": "Groceries",
        "predicted_amount": {
          "milliunits": -425000,
          "formatted": "-$425.00"
        },
        "confidence": 85
      }
    ]
  }
}
```

### Category-Specific Deep Dive

**Human Request:**
> "Give me a detailed analysis of my transportation spending to see where I can optimize"

**Claude Code Usage:**
```javascript
ynab_analyze_spending_patterns({
  budget_id: "budget-id",
  analysis_months: 12,
  category_ids: ["gas-id", "car-maintenance-id", "car-insurance-id", "parking-id"],
  include_anomaly_detection: true,
  grouping: "category"
})
```

### Seasonal Spending Patterns

**Human Request:**
> "Show me how my spending changes throughout the year so I can plan better"

**Response includes seasonal analysis:**
```json
{
  "seasonal_patterns": [
    {
      "month_name": "December",
      "spending_index": 1.45, // 45% above average
      "typical_categories": ["Gifts", "Dining Out", "Travel"]
    },
    {
      "month_name": "July", 
      "spending_index": 1.25, // 25% above average
      "typical_categories": ["Travel", "Entertainment", "Utilities"]
    },
    {
      "month_name": "February",
      "spending_index": 0.85, // 15% below average
      "typical_categories": ["Utilities", "Groceries"]
    }
  ]
}
```

**Planning Insights:**
- **December**: Budget 45% more for holiday spending
- **Summer months**: Increase travel and entertainment budgets
- **February**: Opportunity to boost savings with lower spending

---

## Automated Fund Distribution

### Automated Distribution of Available Funds

**Human Request:**
> "I have $1,500 in 'To Be Budgeted'. Distribute it across my categories based on priorities"

**Claude Code Usage:**
```javascript
ynab_distribute_to_be_budgeted({
  budget_id: "budget-id",
  month: "2024-02-01", // Next month
  distribution_strategy: "goals_first",
  max_amount: 1500000, // $1,500
  emergency_fund_priority: true,
  debt_payoff_priority: true
})
```

**Response:**
```json
{
  "distribution": {
    "month": "2024-02-01",
    "available_to_budget": {
      "milliunits": 1500000,
      "formatted": "$1,500.00"
    },
    "amount_distributed": {
      "milliunits": 1500000,
      "formatted": "$1,500.00"
    },
    "remaining_to_budget": {
      "milliunits": 0,
      "formatted": "$0.00"
    }
  },
  "allocations": [
    {
      "category_id": "emergency-fund-id",
      "category_name": "Emergency Fund",
      "previous_budgeted": {
        "milliunits": 200000,
        "formatted": "$200.00"
      },
      "allocated_amount": {
        "milliunits": 500000,
        "formatted": "$500.00"
      },
      "new_total_budgeted": {
        "milliunits": 700000,
        "formatted": "$700.00"
      },
      "allocation_reason": "High priority emergency fund goal - 3 months behind target",
      "priority": "emergency",
      "goal_progress": {
        "previous_progress": 30,
        "new_progress": 45,
        "fully_funded": false
      }
    },
    {
      "category_id": "credit-card-payment-id", 
      "category_name": "Credit Card Payment",
      "previous_budgeted": {
        "milliunits": 300000,
        "formatted": "$300.00"
      },
      "allocated_amount": {
        "milliunits": 200000,
        "formatted": "$200.00"
      },
      "new_total_budgeted": {
        "milliunits": 500000,
        "formatted": "$500.00"
      },
      "allocation_reason": "Debt payoff priority - can pay extra $200 toward balance",
      "priority": "goal"
    }
  ],
  "strategy_summary": {
    "categories_funded": 8,
    "goals_fully_funded": 2,
    "goals_partially_funded": 4,
    "total_goal_funding": {
      "milliunits": 1200000,
      "formatted": "$1,200.00"
    }
  },
  "recommendations": [
    {
      "type": "success",
      "message": "Successfully funded 2 goals to completion this month"
    },
    {
      "type": "suggestion", 
      "message": "Consider increasing emergency fund allocation next month to reach target faster"
    }
  ]
}
```

### Targeted Distribution

**Human Request:**
> "I want to prioritize specific categories for this distribution"

**Claude Code Usage:**
```javascript
ynab_distribute_to_be_budgeted({
  budget_id: "budget-id",
  month: "2024-02-01",
  distribution_strategy: "custom",
  max_amount: 800000, // $800
  priority_categories: [
    "vacation-savings-id",
    "home-maintenance-id", 
    "car-replacement-id"
  ],
  exclude_categories: [
    "entertainment-id",
    "dining-out-id"
  ]
})
```

### Monthly Distribution Automation

**Human Request:**
> "Help me set up a monthly distribution plan that I can apply consistently"

**Process:**

1. **Analyze historical patterns:**
```javascript
ynab_analyze_spending_patterns({
  budget_id: "budget-id",
  analysis_months: 6,
  grouping: "category"
})
```

2. **Get allocation recommendations:**
```javascript
ynab_recommend_category_allocation({
  budget_id: "budget-id", 
  strategy: "balanced",
  analysis_months: 6
})
```

3. **Create distribution template:**
```javascript
// Example monthly plan based on analysis
const monthlyPlan = {
  emergency_fund: 300000,     // $300
  debt_payments: 400000,      // $400 
  goal_categories: 500000,    // $500
  underfunded_essentials: 200000, // $200
  discretionary: 100000       // $100
};
```

---

## Budget Optimization Strategies

### Zero-Based Budget Review

**Human Request:**
> "Help me do a complete budget review and optimize all my allocations based on data"

**Step 1: Comprehensive analysis**
```javascript
ynab_analyze_spending_patterns({
  budget_id: "budget-id",
  analysis_months: 12,
  include_anomaly_detection: true,
  grouping: "category"
})
```

**Step 2: Get optimization recommendations**
```javascript
ynab_recommend_category_allocation({
  budget_id: "budget-id",
  strategy: "balanced", 
  analysis_months: 12
})
```

**Optimization Strategies:**

1. **Eliminate Low-Value Categories:**
   - Categories with <1% of total spending
   - Categories with no activity in 6+ months
   - Duplicate or overlapping categories

2. **Right-Size High-Variance Categories:**
   - Categories consistently over/under budget by >20%
   - Categories with predictability scores <50
   - Seasonal categories needing adjustment

3. **Accelerate High-Impact Goals:**
   - Emergency fund if <3 months expenses
   - High-interest debt payments
   - Time-sensitive savings goals

### Goal Prioritization Matrix

**Human Request:**
> "I have multiple financial goals. Help me prioritize them based on importance and urgency"

**Analysis Framework:**
```javascript
// Get detailed category information with goals
ynab_get_categories({
  budget_id: "budget-id"
})
```

**Priority Matrix:**

| Category | Importance | Urgency | Target Amount | Monthly Need | Priority Score |
|----------|------------|---------|---------------|--------------|----------------|
| Emergency Fund | High | High | $5,000 | $400 | 95 |
| Credit Card Debt | High | High | $3,000 | $300 | 90 |
| Car Replacement | Medium | Medium | $8,000 | $200 | 70 |
| Vacation | Low | Low | $2,000 | $100 | 40 |

**Recommended Allocation:**
1. Emergency Fund: 40% of available funds
2. Credit Card Debt: 30% of available funds  
3. Car Replacement: 20% of available funds
4. Vacation: 10% of available funds

---

## Advanced Analytics

### Efficiency Metrics

**Human Request:**
> "Calculate my budget efficiency metrics and identify areas for improvement"

**Calculated Metrics:**

1. **Budget Accuracy Rate:**
```javascript
// Based on spending pattern analysis
const accuracyRate = categoriesWithin10Percent / totalCategories * 100;
// Example: 85% of categories within 10% of budgeted amount
```

2. **Goal Achievement Rate:**
```javascript
// Based on goal progress data
const achievementRate = goalsOnTrack / totalGoals * 100;
// Example: 70% of goals on track for target dates
```

3. **Savings Rate:**
```javascript
const savingsRate = (income - expenses) / income * 100;
// Example: 15% savings rate
```

4. **Emergency Fund Ratio:**
```javascript
const emergencyRatio = emergencyFundBalance / monthlyExpenses;
// Example: 2.5 months of expenses saved
```

### Trend Analysis

**Human Request:**
> "Show me trends in my key budget metrics over time"

**Tracking Metrics:**
- Monthly spending variance
- Goal funding consistency
- Category accuracy trends
- Savings rate progression

**Analysis Results:**
```json
{
  "trends": {
    "budget_accuracy": {
      "6_months_ago": 78,
      "current": 85,
      "trend": "improving",
      "change": "+7 percentage points"
    },
    "savings_rate": {
      "6_months_ago": 12,
      "current": 15,
      "trend": "improving", 
      "change": "+3 percentage points"
    },
    "goal_achievement": {
      "6_months_ago": 60,
      "current": 70,
      "trend": "improving",
      "change": "+10 percentage points"
    }
  }
}
```

### Predictive Modeling

**Human Request:**
> "Based on my current trends, predict when I'll reach my financial goals"

**Predictions:**
```json
{
  "goal_projections": [
    {
      "goal_name": "Emergency Fund ($5,000)",
      "current_amount": 1500,
      "target_amount": 5000,
      "monthly_funding": 300,
      "projected_completion": "2024-12-15",
      "confidence": 85
    },
    {
      "goal_name": "Credit Card Payoff",
      "current_balance": 3000,
      "monthly_payment": 400,
      "projected_completion": "2024-09-30", 
      "confidence": 92
    }
  ]
}
```

---

## Goal-Based Planning

### SMART Goal Integration

**Human Request:**
> "Help me create a comprehensive plan to achieve my financial goals using SMART criteria"

**SMART Goal Framework:**
- **Specific**: Emergency fund of $10,000
- **Measurable**: Track monthly contributions
- **Achievable**: Based on income and expenses
- **Relevant**: Financial security priority
- **Time-bound**: 18-month target

**Implementation:**
```javascript
ynab_recommend_category_allocation({
  budget_id: "budget-id",
  strategy: "goals_first",
  analysis_months: 12,
  emergency_fund_target: 10000000, // $10,000
  available_funds: 1000000 // $1,000 available
})
```

### Multi-Goal Coordination

**Human Request:**
> "I have 5 different savings goals. Coordinate funding to optimize completion dates"

**Coordination Strategy:**
```javascript
ynab_distribute_to_be_budgeted({
  budget_id: "budget-id",
  distribution_strategy: "goals_first",
  max_amount: 2000000, // $2,000
  priority_categories: [
    "emergency-fund-id",      // Highest priority
    "debt-payoff-id",         // High priority  
    "car-replacement-id",     // Medium priority
    "home-downpayment-id",    // Medium priority
    "vacation-fund-id"        // Lowest priority
  ]
})
```

**Optimization Logic:**
1. Fund emergency fund to minimum level (3 months)
2. Accelerate high-interest debt payoff
3. Balance remaining goals by urgency and target dates
4. Adjust monthly contributions based on goal priorities

### Dynamic Goal Adjustment

**Human Request:**
> "My income increased by $500/month. Recalculate my goal timelines and funding"

**Recalculation Process:**
1. **Update available funds:**
```javascript
const newMonthlyIncome = currentIncome + 500000; // +$500
const newAvailableFunds = newMonthlyIncome - fixedExpenses;
```

2. **Redistribute with increased capacity:**
```javascript
ynab_recommend_category_allocation({
  budget_id: "budget-id",
  strategy: "goals_first", 
  available_funds: newAvailableFunds,
  analysis_months: 6
})
```

3. **Update goal timelines:**
   - Emergency fund: 12 months → 8 months
   - Debt payoff: 18 months → 12 months
   - Car replacement: 24 months → 18 months

---

## Best Practices for Data-Driven Budgeting

### Regular Analysis Schedule

**Monthly Reviews:**
- Run spending pattern analysis
- Check goal progress and funding
- Adjust allocations based on actuals

**Quarterly Deep Dives:**
- Comprehensive 12-month spending analysis
- Goal prioritization review
- Strategy effectiveness assessment

**Annual Planning:**
- Zero-based budget review
- Goal setting for the next year
- Income and expense projections

### Data Quality Maintenance

1. **Accurate Categorization:**
   - Keep categories consistently assigned
   - Regular cleanup of miscategorized transactions
   - Use clear, descriptive category names

2. **Goal Management:**
   - Keep goal targets and dates updated
   - Document goal reasoning and priorities
   - Track goal achievement rates

3. **Regular Calibration:**
   - Compare recommendations with actual results
   - Adjust strategies based on performance
   - Learn from successful allocation decisions

### Integration with Manual Planning

**Combine Data with Human Judgment:**
- Use automated tools for data analysis and pattern recognition
- Apply human context for life changes and priorities
- Balance algorithmic recommendations with personal values

**Override When Necessary:**
- Life events requiring priority changes
- Seasonal adjustments not captured in historical data
- Personal preference overrides for discretionary categories

**Document Decisions:**
- Track which recommendations were followed
- Note reasons for overrides or modifications
- Measure results to improve future decisions

---

The analysis and allocation features provide powerful insights and automation while still allowing for personal control and adjustment. Use these tools to enhance your decision-making with data-driven recommendations while maintaining alignment with your personal financial goals and values.