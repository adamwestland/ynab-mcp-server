import { z } from 'zod';
import { YnabTool } from '../base.js';
import type { YnabBudgetsResponse } from '../../types/index.js';

/**
 * Input schema for the list budgets tool
 */
const ListBudgetsInputSchema = z.object({
  include_accounts: z.boolean().optional().describe('Include account details for each budget'),
}).optional().default({});

type ListBudgetsInput = z.infer<typeof ListBudgetsInputSchema>;

/**
 * Tool for listing all budgets accessible to the user
 * 
 * This tool retrieves all budgets associated with the YNAB account, including:
 * - Budget IDs and names
 * - Currency format information
 * - Date range information
 * - Default budget identification
 */
export class ListBudgetsTool extends YnabTool {
  name = 'ynab_list_budgets';
  description = 'Get all budgets accessible to the user. Returns budget IDs, names, currency formats, and identifies the default budget. Optionally includes account details for each budget.';
  inputSchema = ListBudgetsInputSchema;

  /**
   * Execute the list budgets tool
   * 
   * @param args Input arguments (optional include_accounts flag)
   * @returns List of budgets with metadata
   */
  async execute(args: unknown): Promise<{
    budgets: Array<{
      id: string;
      name: string;
      currency_format: {
        iso_code: string;
        example_format: string;
        decimal_digits: number;
        decimal_separator: string;
        symbol_first: boolean;
        group_separator: string;
        currency_symbol: string;
        display_symbol: boolean;
      };
      date_format: {
        format: string;
      };
      first_month: string;
      last_month: string;
      last_modified_on: string;
      is_default: boolean;
      accounts_count?: number;
      on_budget_accounts_count?: number;
    }>;
    default_budget_id: string | null;
    total_budgets: number;
  }> {
    const input = this.validateArgs<ListBudgetsInput>(args);

    try {
      // Get all budgets from YNAB API
      const budgetsResponse: YnabBudgetsResponse = await this.client.getBudgets();

      // Process budget data
      const budgets = await Promise.all(
        budgetsResponse.budgets.map(async (budget) => {
          const budgetInfo = {
            id: budget.id,
            name: budget.name,
            currency_format: {
              iso_code: budget.currency_format.iso_code,
              example_format: budget.currency_format.example_format,
              decimal_digits: budget.currency_format.decimal_digits,
              decimal_separator: budget.currency_format.decimal_separator,
              symbol_first: budget.currency_format.symbol_first,
              group_separator: budget.currency_format.group_separator,
              currency_symbol: budget.currency_format.currency_symbol,
              display_symbol: budget.currency_format.display_symbol,
            },
            date_format: {
              format: budget.date_format.format,
            },
            first_month: budget.first_month,
            last_month: budget.last_month,
            last_modified_on: budget.last_modified_on,
            is_default: budgetsResponse.default_budget?.id === budget.id,
          };

          // Optionally include account information
          if (input.include_accounts) {
            try {
              const accountsResponse = await this.client.getAccounts(budget.id);
              const onBudgetAccounts = accountsResponse.accounts.filter(account => account.on_budget);
              
              return {
                ...budgetInfo,
                accounts_count: accountsResponse.accounts.length,
                on_budget_accounts_count: onBudgetAccounts.length,
              };
            } catch (error) {
              console.warn(`Failed to get accounts for budget ${budget.id}:`, error);
              return budgetInfo;
            }
          }

          return budgetInfo;
        })
      );

      return {
        budgets: budgets.sort((a, b) => {
          // Sort with default budget first, then alphabetically
          if (a.is_default && !b.is_default) return -1;
          if (!a.is_default && b.is_default) return 1;
          return a.name.localeCompare(b.name);
        }),
        default_budget_id: budgetsResponse.default_budget?.id || null,
        total_budgets: budgets.length,
      };

    } catch (error) {
      this.handleError(error, 'list budgets');
    }
  }
}