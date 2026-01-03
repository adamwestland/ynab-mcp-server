import { z } from 'zod';
import { YnabTool } from '../base.js';
import type { YnabBudgetMonthResponse } from '../../types/index.js';

/**
 * Input schema for the get budget month tool
 */
const GetBudgetMonthInputSchema = z.object({
  budget_id: z.string().describe('The ID of the budget to get month data for'),
  month: z.string().regex(/^\d{4}-\d{2}-01$/).describe('The budget month in YYYY-MM-01 format (first day of month)'),
});

type GetBudgetMonthInput = z.infer<typeof GetBudgetMonthInputSchema>;

/**
 * Tool for getting budget data for a specific month
 * 
 * This tool retrieves comprehensive budget information for a month including:
 * - Month-level summary (income, budgeted, activity)
 * - All categories with their budgeted amounts, activity, and balances
 * - To be budgeted amount
 * - Age of money
 * - Category goals and progress
 */
export class GetBudgetMonthTool extends YnabTool {
  name = 'ynab_get_budget_month';
  description = 'Get budget data for a specific month. Includes all categories with budgeted amounts, activity, balances, and goals. Also includes to_be_budgeted and age_of_money.';
  inputSchema = GetBudgetMonthInputSchema;

  /**
   * Execute the get budget month tool
   * 
   * @param args Input arguments including budget_id and month
   * @returns Comprehensive budget month data with all categories
   */
  async execute(args: unknown): Promise<{
    month: {
      month: string;
      note: string | null;
      income: {
        milliunits: number;
        formatted: string;
      };
      budgeted: {
        milliunits: number;
        formatted: string;
      };
      activity: {
        milliunits: number;
        formatted: string;
      };
      to_be_budgeted: {
        milliunits: number;
        formatted: string;
      };
      age_of_money: number | null;
      deleted: boolean;
      categories: Array<{
        id: string;
        category_group_id: string;
        category_group_name: string;
        name: string;
        hidden: boolean;
        original_category_group_id: string | null;
        note: string | null;
        budgeted: {
          milliunits: number;
          formatted: string;
        };
        activity: {
          milliunits: number;
          formatted: string;
        };
        balance: {
          milliunits: number;
          formatted: string;
        };
        goal_type: string | null;
        goal_day: number | null;
        goal_cadence: number | null;
        goal_cadence_frequency: number | null;
        goal_creation_month: string | null;
        goal_target: {
          milliunits: number;
          formatted: string;
        } | null;
        goal_target_month: string | null;
        goal_percentage_complete: number | null;
        goal_months_to_budget: number | null;
        goal_under_funded: {
          milliunits: number;
          formatted: string;
        } | null;
        goal_overall_funded: {
          milliunits: number;
          formatted: string;
        } | null;
        goal_overall_left: {
          milliunits: number;
          formatted: string;
        } | null;
        deleted: boolean;
      }>;
    };
    server_knowledge: number;
  }> {
    const input = this.validateArgs<GetBudgetMonthInput>(args);

    try {
      // Validate month format - should be first day of month
      const monthDate = new Date(input.month);
      if (monthDate.getDate() !== 1) {
        throw new Error('Month must be in YYYY-MM-01 format (first day of month)');
      }

      // Get the budget month data
      const budgetMonthResponse: YnabBudgetMonthResponse = await this.client.getBudgetMonth(
        input.budget_id,
        input.month
      );

      const month = budgetMonthResponse.month;

      // Get category groups for category group names
      const categoriesResponse = await this.client.getCategories(input.budget_id);
      const categoryGroups = categoriesResponse.category_groups;

      // Process and format budget month data
      const processedCategories = month.categories.map(category => {
        // Find the category group name
        const categoryGroup = categoryGroups.find(group => 
          group.categories.some(cat => cat.id === category.id)
        );

        return {
          id: category.id,
          category_group_id: category.category_group_id,
          category_group_name: categoryGroup?.name || 'Unknown',
          name: category.name,
          hidden: category.hidden,
          original_category_group_id: category.original_category_group_id,
          note: category.note,
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
          goal_type: category.goal_type,
          goal_day: category.goal_day,
          goal_cadence: category.goal_cadence,
          goal_cadence_frequency: category.goal_cadence_frequency,
          goal_creation_month: category.goal_creation_month,
          goal_target: category.goal_target ? {
            milliunits: category.goal_target,
            formatted: this.formatCurrency(category.goal_target),
          } : null,
          goal_target_month: category.goal_target_month,
          goal_percentage_complete: category.goal_percentage_complete,
          goal_months_to_budget: category.goal_months_to_budget,
          goal_under_funded: category.goal_under_funded ? {
            milliunits: category.goal_under_funded,
            formatted: this.formatCurrency(category.goal_under_funded),
          } : null,
          goal_overall_funded: category.goal_overall_funded ? {
            milliunits: category.goal_overall_funded,
            formatted: this.formatCurrency(category.goal_overall_funded),
          } : null,
          goal_overall_left: category.goal_overall_left ? {
            milliunits: category.goal_overall_left,
            formatted: this.formatCurrency(category.goal_overall_left),
          } : null,
          deleted: category.deleted,
        };
      });

      const processedMonth = {
        month: month.month,
        note: month.note,
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
        deleted: month.deleted,
        categories: processedCategories,
      };

      return {
        month: processedMonth,
        server_knowledge: budgetMonthResponse.server_knowledge,
      };

    } catch (error) {
      this.handleError(error, 'get budget month');
    }
  }
}