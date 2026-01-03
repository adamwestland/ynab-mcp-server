import { z } from 'zod';
import { YnabTool } from '../base.js';
import type { YnabAccountsResponse } from '../../types/index.js';

/**
 * Input schema for the get accounts tool
 */
const GetAccountsInputSchema = z.object({
  budget_id: z.string().describe('The ID of the budget to get accounts for'),
  last_knowledge_of_server: z.number().optional().describe('Server knowledge for delta sync - only return data modified since this value'),
  account_type: z.enum(['checking', 'savings', 'cash', 'creditCard', 'lineOfCredit', 'otherAsset', 'otherLiability', 'payPal', 'merchantAccount', 'investmentAccount', 'mortgage']).optional().describe('Filter accounts by type'),
  on_budget_only: z.boolean().optional().describe('Only return on-budget accounts'),
  include_closed: z.boolean().optional().default(false).describe('Include closed accounts in results'),
});

type GetAccountsInput = z.infer<typeof GetAccountsInputSchema>;

/**
 * Tool for getting all accounts for a specific budget
 * 
 * This tool retrieves account information including:
 * - Account IDs, names, and types
 * - Current balances (cleared, uncleared, total)
 * - Transfer payee IDs (critical for transfer processing)
 * - Account status (on/off budget, open/closed)
 * - Direct import information
 * - Debt-specific information for loan accounts
 */
export class GetAccountsTool extends YnabTool {
  name = 'ynab_get_accounts';
  description = 'Get all accounts for a specific budget. Includes account IDs, names, types, balances, and transfer_payee_id (critical for transfers). Supports delta sync and filtering options.';
  inputSchema = GetAccountsInputSchema;

  /**
   * Execute the get accounts tool
   * 
   * @param args Input arguments including budget_id and optional filters
   * @returns Account details with balances and metadata
   */
  async execute(args: unknown): Promise<{
    accounts: Array<{
      id: string;
      name: string;
      type: string;
      on_budget: boolean;
      closed: boolean;
      note: string | null;
      balance: {
        current: number;
        cleared: number;
        uncleared: number;
        formatted_current: string;
        formatted_cleared: string;
        formatted_uncleared: string;
      };
      transfer_payee_id: string;
      direct_import_linked: boolean;
      direct_import_in_error: boolean;
      last_reconciled_at: string | null;
      debt_info?: {
        original_balance: number | null;
        interest_rates: Record<string, number> | null;
        minimum_payments: Record<string, number> | null;
        escrow_amounts: Record<string, number> | null;
      };
    }>;
    server_knowledge: number;
    filtered_count: number;
    total_count: number;
  }> {
    const input = this.validateArgs<GetAccountsInput>(args);

    try {
      // Get accounts from YNAB API with optional delta sync
      const accountsResponse: YnabAccountsResponse = await this.client.getAccounts(
        input.budget_id,
        input.last_knowledge_of_server
      );

      // Filter accounts based on criteria
      let filteredAccounts = accountsResponse.accounts;

      // Filter by account type if specified
      if (input.account_type) {
        filteredAccounts = filteredAccounts.filter(account => 
          account.type.toLowerCase() === input.account_type!.toLowerCase()
        );
      }

      // Filter by on-budget status if specified
      if (input.on_budget_only) {
        filteredAccounts = filteredAccounts.filter(account => account.on_budget);
      }

      // Filter out closed accounts unless explicitly requested
      if (!input.include_closed) {
        filteredAccounts = filteredAccounts.filter(account => !account.closed);
      }

      // Process and format account data
      const processedAccounts = filteredAccounts.map(account => {
        const baseAccount = {
          id: account.id,
          name: account.name,
          type: account.type,
          on_budget: account.on_budget,
          closed: account.closed,
          note: account.note,
          balance: {
            current: account.balance,
            cleared: account.cleared_balance,
            uncleared: account.uncleared_balance,
            formatted_current: this.formatCurrency(account.balance),
            formatted_cleared: this.formatCurrency(account.cleared_balance),
            formatted_uncleared: this.formatCurrency(account.uncleared_balance),
          },
          transfer_payee_id: account.transfer_payee_id,
          direct_import_linked: account.direct_import_linked,
          direct_import_in_error: account.direct_import_in_error,
          last_reconciled_at: account.last_reconciled_at,
        };

        // Add debt information if available (for loan accounts)
        if (account.debt_original_balance !== null || 
            account.debt_interest_rates !== null || 
            account.debt_minimum_payments !== null || 
            account.debt_escrow_amounts !== null) {
          
          return {
            ...baseAccount,
            debt_info: {
              original_balance: account.debt_original_balance,
              interest_rates: account.debt_interest_rates,
              minimum_payments: account.debt_minimum_payments,
              escrow_amounts: account.debt_escrow_amounts,
            },
          };
        }

        return baseAccount;
      });

      // Sort accounts by type and name
      const sortedAccounts = processedAccounts.sort((a, b) => {
        // First sort by on-budget status (on-budget accounts first)
        if (a.on_budget && !b.on_budget) return -1;
        if (!a.on_budget && b.on_budget) return 1;
        
        // Then sort by account type
        if (a.type !== b.type) {
          return a.type.localeCompare(b.type);
        }
        
        // Finally sort by name
        return a.name.localeCompare(b.name);
      });

      return {
        accounts: sortedAccounts,
        server_knowledge: accountsResponse.server_knowledge,
        filtered_count: sortedAccounts.length,
        total_count: accountsResponse.accounts.length,
      };

    } catch (error) {
      this.handleError(error, 'get accounts');
    }
  }
}