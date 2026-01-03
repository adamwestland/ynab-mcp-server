import { z } from 'zod';
import { YnabTool } from '../base.js';
import type { YnabCategoryResponse } from '../../types/index.js';

/**
 * Input schema for the update category budget tool
 */
const UpdateCategoryBudgetInputSchema = z.object({
  budget_id: z.string().describe('The ID of the budget containing the category'),
  category_id: z.string().describe('The ID of the category to update'),
  month: z.string().regex(/^\d{4}-\d{2}-01$/).describe('The budget month in YYYY-MM-01 format (first day of month)'),
  budgeted: z.number().describe('The budgeted amount in milliunits (1000 = $1.00)'),
});

type UpdateCategoryBudgetInput = z.infer<typeof UpdateCategoryBudgetInputSchema>;

/**
 * Tool for updating the budgeted amount for a category in a specific month
 * 
 * This tool allows you to:
 * - Set the budgeted amount for a category in any month
 * - Handle goal adjustments automatically
 * - Update budget allocations
 * - Get updated category information after the change
 */
export class UpdateCategoryBudgetTool extends YnabTool {
  name = 'ynab_update_category_budget';
  description = 'Update the budgeted amount for a category in a specific month. Amounts should be in milliunits (1000 = $1.00). Returns updated category information.';
  inputSchema = UpdateCategoryBudgetInputSchema;

  /**
   * Execute the update category budget tool
   * 
   * @param args Input arguments including budget_id, category_id, month, and budgeted amount
   * @returns Updated category information
   */
  async execute(args: unknown): Promise<{
    category: {
      id: string;
      category_group_id: string;
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
    };
    server_knowledge: number;
  }> {
    const input = this.validateArgs<UpdateCategoryBudgetInput>(args);

    try {
      // Month format is already validated by Zod schema regex /^\d{4}-\d{2}-01$/
      // The string format YYYY-MM-01 is passed directly to the API

      // Update the category budget
      const categoryResponse: YnabCategoryResponse = await this.client.updateCategoryBudget(
        input.budget_id,
        input.category_id,
        input.month,
        input.budgeted
      );

      const category = categoryResponse.category;

      // Process and format updated category data
      const processedCategory = {
        id: category.id,
        category_group_id: category.category_group_id,
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

      return {
        category: processedCategory,
        server_knowledge: categoryResponse.server_knowledge,
      };

    } catch (error) {
      this.handleError(error, 'update category budget');
    }
  }
}