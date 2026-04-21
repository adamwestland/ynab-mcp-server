import { z } from 'zod';
import { YnabTool } from '../base.js';
import type { YnabCategoriesResponse, YnabCategory } from '../../types/index.js';

const CategoryFilterSchema = z.enum(['active', 'with_activity', 'with_balance', 'all']);
type CategoryFilter = z.infer<typeof CategoryFilterSchema>;

const GetCategoriesInputSchema = z.object({
  budget_id: z.string().describe('The ID of the budget to get categories for'),
  category_filter: CategoryFilterSchema.optional().default('active').describe(
    'Which categories to include. "active" (default): budgeted/activity/balance non-zero. "with_activity": activity non-zero. "with_balance": balance non-zero. "all": every non-deleted category (including zero-balance). Deleted categories/groups and goal metadata are always omitted.'
  ),
  last_knowledge_of_server: z.number().optional().describe('Server knowledge for delta sync - only return data modified since this value'),
});

type GetCategoriesInput = z.infer<typeof GetCategoriesInputSchema>;

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

interface ProcessedCategoryGroup {
  id: string;
  name: string;
  hidden: boolean;
  categories: ProcessedCategory[];
}

function shouldInclude(c: YnabCategory, filter: CategoryFilter): boolean {
  if (c.deleted) return false;
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

/**
 * Tool for getting all categories and category groups for a budget
 *
 * Returns only active categories by default (budgeted/activity/balance non-zero)
 * and omits goal metadata + deleted groups/categories to keep payload small.
 * Use category_filter to broaden or narrow the result.
 */
export class GetCategoriesTool extends YnabTool {
  name = 'ynab_get_categories';
  description = 'Get categories and category groups for a budget. Returns only active categories by default (budgeted/activity/balance non-zero) and omits goal metadata and deleted groups/categories. Use category_filter to broaden or narrow the result. Supports delta sync.';
  inputSchema = GetCategoriesInputSchema;

  async execute(args: unknown): Promise<{
    category_groups: ProcessedCategoryGroup[];
    server_knowledge: number;
  }> {
    const input = this.validateArgs<GetCategoriesInput>(args);

    try {
      const requestOptions = {
        ...(input.last_knowledge_of_server !== undefined && {
          lastKnowledgeOfServer: input.last_knowledge_of_server,
        }),
      };

      const categoriesResponse: YnabCategoriesResponse = await this.client.getCategories(
        input.budget_id,
        requestOptions
      );

      const processedCategoryGroups: ProcessedCategoryGroup[] = [];
      for (const group of categoriesResponse.category_groups) {
        if (group.deleted) continue;

        const categories: ProcessedCategory[] = [];
        for (const category of group.categories) {
          if (!shouldInclude(category, input.category_filter)) continue;

          const processed: ProcessedCategory = {
            id: category.id,
            category_group_id: category.category_group_id,
            category_group_name: group.name,
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

          categories.push(processed);
        }

        if (categories.length === 0) continue;

        processedCategoryGroups.push({
          id: group.id,
          name: group.name,
          hidden: group.hidden,
          categories,
        });
      }

      return {
        category_groups: processedCategoryGroups,
        server_knowledge: categoriesResponse.server_knowledge,
      };
    } catch (error) {
      this.handleError(error, 'get categories');
    }
  }
}
