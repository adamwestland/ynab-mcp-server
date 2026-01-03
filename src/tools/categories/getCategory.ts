import { z } from 'zod';
import { YnabTool } from '../base.js';
import type { YnabCategoryResponse } from '../../types/index.js';

/**
 * Input schema for the get category tool
 */
const GetCategoryInputSchema = z.object({
  budget_id: z.string().describe('The ID of the budget containing the category'),
  category_id: z.string().describe('The ID of the category to retrieve'),
});

type GetCategoryInput = z.infer<typeof GetCategoryInputSchema>;

/**
 * Tool for getting a single category by ID
 * 
 * This tool retrieves detailed information for a specific category including:
 * - Basic category information (name, group, notes)
 * - Current month budgeting data (budgeted, activity, balance)
 * - Goal information if present
 * - Category state (hidden, deleted)
 * - Historical group information
 */
export class GetCategoryTool extends YnabTool {
  name = 'ynab_get_category';
  description = 'Get a single category by ID. Includes full category details, current month budgeting information, and goal data.';
  inputSchema = GetCategoryInputSchema;

  /**
   * Execute the get category tool
   * 
   * @param args Input arguments including budget_id and category_id
   * @returns Detailed category information with current month data
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
  }> {
    const input = this.validateArgs<GetCategoryInput>(args);

    try {
      const categoryResponse: YnabCategoryResponse = await this.client.getCategory(
        input.budget_id,
        input.category_id
      );

      const category = categoryResponse.category;

      // Process and format category data
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
      };

    } catch (error) {
      this.handleError(error, 'get category');
    }
  }
}