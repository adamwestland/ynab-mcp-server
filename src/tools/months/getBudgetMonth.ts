import { z } from 'zod';
import { YnabTool } from '../base.js';
import type { YnabBudgetMonthResponse, YnabCategory } from '../../types/index.js';

const CategoryFilterSchema = z.enum(['active', 'with_activity', 'with_balance', 'all']);
type CategoryFilter = z.infer<typeof CategoryFilterSchema>;

const GetBudgetMonthInputSchema = z.object({
  budget_id: z.string().describe('The ID of the budget to get month data for'),
  month: z.string().regex(/^\d{4}-\d{2}-01$/).describe('The budget month in YYYY-MM-01 format (first day of month)'),
  category_filter: CategoryFilterSchema.optional().default('active').describe(
    'Which categories to include. "active" (default): budgeted/activity/balance non-zero. "with_activity": activity non-zero. "with_balance": balance non-zero. "all": every category. Zero-only rows and goal metadata are dropped from the response regardless of filter.'
  ),
});

type GetBudgetMonthInput = z.infer<typeof GetBudgetMonthInputSchema>;

interface FormattedAmount {
  milliunits: number;
  formatted: string;
}

interface ProcessedCategory {
  id: string;
  category_group_id: string;
  category_group_name: string;
  name: string;
  hidden: boolean;
  budgeted: FormattedAmount;
  activity: FormattedAmount;
  balance: FormattedAmount;
  note?: string;
}

interface ProcessedMonth {
  month: string;
  income: FormattedAmount;
  budgeted: FormattedAmount;
  activity: FormattedAmount;
  to_be_budgeted: FormattedAmount;
  age_of_money: number | null;
  categories: ProcessedCategory[];
  note?: string;
}

function shouldInclude(c: YnabCategory, filter: CategoryFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'with_activity':
      return c.activity !== 0;
    case 'with_balance':
      return c.balance !== 0;
    case 'active':
      return c.budgeted !== 0 || c.activity !== 0 || c.balance !== 0;
  }
}

export class GetBudgetMonthTool extends YnabTool {
  name = 'ynab_get_budget_month';
  description = 'Get budget data for a specific month. Returns only active categories by default (budgeted/activity/balance non-zero) and omits goal metadata. Use category_filter to broaden or narrow the result.';
  inputSchema = GetBudgetMonthInputSchema;

  async execute(args: unknown): Promise<{ month: ProcessedMonth; server_knowledge: number }> {
    const input = this.validateArgs<GetBudgetMonthInput>(args);

    try {
      const budgetMonthResponse: YnabBudgetMonthResponse = await this.client.getBudgetMonth(
        input.budget_id,
        input.month
      );

      const month = budgetMonthResponse.month;

      const categoriesResponse = await this.client.getCategories(input.budget_id);
      const categoryGroups = categoriesResponse.category_groups;

      const processedCategories = month.categories
        .filter(category => shouldInclude(category, input.category_filter))
        .map(category => {
          const categoryGroup = categoryGroups.find(group =>
            group.categories.some(cat => cat.id === category.id)
          );

          const processed: ProcessedCategory = {
            id: category.id,
            category_group_id: category.category_group_id,
            category_group_name: categoryGroup?.name || 'Unknown',
            name: category.name,
            hidden: category.hidden,
            budgeted: {
              milliunits: category.budgeted,
              formatted: this.formatCurrency(category.budgeted),
            },
            activity: {
              milliunits: category.activity,
              formatted: this.formatCurrency(category.activity),
            },
            balance: {
              milliunits: category.balance,
              formatted: this.formatCurrency(category.balance),
            },
          };

          if (category.note) processed.note = category.note;

          return processed;
        });

      const processedMonth: ProcessedMonth = {
        month: month.month,
        income: {
          milliunits: month.income,
          formatted: this.formatCurrency(month.income),
        },
        budgeted: {
          milliunits: month.budgeted,
          formatted: this.formatCurrency(month.budgeted),
        },
        activity: {
          milliunits: month.activity,
          formatted: this.formatCurrency(month.activity),
        },
        to_be_budgeted: {
          milliunits: month.to_be_budgeted,
          formatted: this.formatCurrency(month.to_be_budgeted),
        },
        age_of_money: month.age_of_money,
        categories: processedCategories,
      };

      if (month.note) processedMonth.note = month.note;

      return {
        month: processedMonth,
        server_knowledge: budgetMonthResponse.server_knowledge,
      };

    } catch (error) {
      this.handleError(error, 'get budget month');
    }
  }
}
