import { z } from 'zod';
import { YnabTool } from '../base.js';
import type { YnabCategoriesResponse } from '../../types/index.js';

/**
 * Input schema for the get categories tool
 */
const GetCategoriesInputSchema = z.object({
  budget_id: z.string().describe('The ID of the budget to get categories for'),
  last_knowledge_of_server: z.number().optional().describe('Server knowledge for delta sync - only return data modified since this value'),
});

type GetCategoriesInput = z.infer<typeof GetCategoriesInputSchema>;

/**
 * Tool for getting all categories and category groups for a budget
 * 
 * This tool retrieves category information including:
 * - Category group hierarchies
 * - Individual category details
 * - Budgeted amounts, activity, and balance
 * - Goal information (target amounts, dates, etc.)
 * - Hidden categories and groups
 * - Delta sync support for efficient updates
 */
export class GetCategoriesTool extends YnabTool {
  name = 'ynab_get_categories';
  description = 'Get all categories and category groups for a budget. Includes budgeted amounts, activity, balance, and goal information. Supports delta sync for efficient updates.';
  inputSchema = GetCategoriesInputSchema;

  /**
   * Execute the get categories tool
   * 
   * @param args Input arguments including budget_id and optional delta sync
   * @returns Category groups and categories with comprehensive metadata
   */
  async execute(args: unknown): Promise<{
    category_groups: Array<{
      id: string;
      name: string;
      hidden: boolean;
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
    }>;
    server_knowledge: number;
  }> {
    const input = this.validateArgs<GetCategoriesInput>(args);

    try {
      const requestOptions = {
        ...(input.last_knowledge_of_server !== undefined && { 
          lastKnowledgeOfServer: input.last_knowledge_of_server 
        }),
      };

      const categoriesResponse: YnabCategoriesResponse = await this.client.getCategories(
        input.budget_id,
        requestOptions
      );

      // Process and format category data
      const processedCategoryGroups = categoriesResponse.category_groups.map(group => ({
        id: group.id,
        name: group.name,
        hidden: group.hidden,
        deleted: group.deleted,
        categories: group.categories.map(category => ({
          id: category.id,
          category_group_id: category.category_group_id,
          category_group_name: group.name,
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
        })),
      }));

      return {
        category_groups: processedCategoryGroups,
        server_knowledge: categoriesResponse.server_knowledge,
      };

    } catch (error) {
      this.handleError(error, 'get categories');
    }
  }
}