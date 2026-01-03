import { z } from 'zod';
import { YnabTool } from '../base.js';
import type { YnabTransactionsResponse } from '../../types/index.js';

/**
 * Input schema for the get transactions tool
 */
const GetTransactionsInputSchema = z.object({
  budget_id: z.string().describe('The ID of the budget to get transactions for'),
  account_id: z.string().optional().describe('Filter transactions to a specific account'),
  since_date: z.string().optional().describe('Only return transactions on or after this date (ISO format: YYYY-MM-DD)'),
  type: z.enum(['uncategorized', 'unapproved']).optional().describe('Filter transactions by type'),
  last_knowledge_of_server: z.number().optional().describe('Server knowledge for delta sync - only return data modified since this value'),
  category_id: z.string().optional().describe('Filter transactions to a specific category'),
  payee_id: z.string().optional().describe('Filter transactions to a specific payee'),
  cleared_status: z.enum(['cleared', 'uncleared', 'reconciled']).optional().describe('Filter by cleared status'),
  include_subtransactions: z.boolean().optional().default(true).describe('Include subtransactions for split transactions'),
  limit: z.number().int().min(1).max(1000).optional().describe('Maximum number of transactions to return (max 1000)'),
});

type GetTransactionsInput = z.infer<typeof GetTransactionsInputSchema>;

/**
 * Tool for getting transactions with comprehensive filtering options
 * 
 * This tool retrieves transaction information including:
 * - Transaction details (date, amount, memo, cleared status)
 * - Payee and category information
 * - Account and transfer information
 * - Subtransactions for split transactions
 * - Import and matching information
 * - Approval status and flags
 */
export class GetTransactionsTool extends YnabTool {
  name = 'ynab_get_transactions';
  description = 'Get transactions with comprehensive filtering options. Supports date filtering, account filtering, category/payee filtering, and delta sync. Includes subtransactions for splits and transfer information.';
  inputSchema = GetTransactionsInputSchema;

  /**
   * Execute the get transactions tool
   * 
   * @param args Input arguments including budget_id and filtering options
   * @returns Transaction details with comprehensive metadata
   */
  async execute(args: unknown): Promise<{
    transactions: Array<{
      id: string;
      date: string;
      amount: {
        milliunits: number;
        formatted: string;
      };
      memo: string | null;
      payee: {
        id: string | null;
        name: string | null;
      };
      category: {
        id: string | null;
        name: string | null;
      };
      account: {
        id: string;
        name: string;
      };
      transfer: {
        account_id: string | null;
        transaction_id: string | null;
      } | null;
      cleared: string;
      approved: boolean;
      flag: {
        color: string | null;
        name: string | null;
      } | null;
      import_info: {
        id: string | null;
        payee_name: string | null;
        payee_name_original: string | null;
      } | null;
      matched_transaction_id: string | null;
      debt_transaction_type: string | null;
      subtransactions?: Array<{
        id: string;
        transaction_id: string;
        amount: {
          milliunits: number;
          formatted: string;
        };
        memo: string | null;
        payee: {
          id: string | null;
          name: string | null;
        };
        category: {
          id: string | null;
          name: string | null;
        };
        transfer: {
          account_id: string | null;
          transaction_id: string | null;
        } | null;
      }>;
    }>;
    server_knowledge: number;
    filtered_count: number;
    has_more: boolean;
  }> {
    const input = this.validateArgs<GetTransactionsInput>(args);

    try {
      let transactionsResponse: YnabTransactionsResponse;

      // Get transactions - either from specific account or all accounts
      const requestOptions = {
        ...(input.since_date && { sinceDate: input.since_date }),
        ...(input.type && { type: input.type }),
        ...(input.last_knowledge_of_server !== undefined && { lastKnowledgeOfServer: input.last_knowledge_of_server }),
      };

      if (input.account_id) {
        transactionsResponse = await this.client.getAccountTransactions(
          input.budget_id,
          input.account_id,
          requestOptions
        );
      } else {
        transactionsResponse = await this.client.getTransactions(
          input.budget_id,
          requestOptions
        );
      }

      // Apply additional client-side filtering
      let filteredTransactions = transactionsResponse.transactions;

      // Filter by category if specified
      if (input.category_id) {
        filteredTransactions = filteredTransactions.filter(tx => 
          tx.category_id === input.category_id || 
          // Also check subtransactions if they exist
          (tx.subtransactions && tx.subtransactions.some(sub => sub.category_id === input.category_id))
        );
      }

      // Filter by payee if specified
      if (input.payee_id) {
        filteredTransactions = filteredTransactions.filter(tx => 
          tx.payee_id === input.payee_id ||
          // Also check subtransactions if they exist
          (tx.subtransactions && tx.subtransactions.some(sub => sub.payee_id === input.payee_id))
        );
      }

      // Filter by cleared status if specified
      if (input.cleared_status) {
        filteredTransactions = filteredTransactions.filter(tx => 
          tx.cleared.toLowerCase() === input.cleared_status!.toLowerCase()
        );
      }

      // Apply limit if specified
      if (input.limit) {
        filteredTransactions = filteredTransactions.slice(0, input.limit);
      }

      // Process and format transaction data
      const processedTransactions = filteredTransactions.map(transaction => {
        const baseTransaction = {
          id: transaction.id,
          date: transaction.date,
          amount: {
            milliunits: transaction.amount,
            formatted: this.formatCurrency(transaction.amount),
          },
          memo: transaction.memo,
          payee: {
            id: transaction.payee_id,
            name: transaction.payee_name,
          },
          category: {
            id: transaction.category_id,
            name: transaction.category_name,
          },
          account: {
            id: transaction.account_id,
            name: transaction.account_name,
          },
          transfer: transaction.transfer_account_id ? {
            account_id: transaction.transfer_account_id,
            transaction_id: transaction.transfer_transaction_id,
          } : null,
          cleared: transaction.cleared,
          approved: transaction.approved,
          flag: (transaction.flag_color || transaction.flag_name) ? {
            color: transaction.flag_color,
            name: transaction.flag_name,
          } : null,
          import_info: (transaction.import_id || transaction.import_payee_name || transaction.import_payee_name_original) ? {
            id: transaction.import_id,
            payee_name: transaction.import_payee_name,
            payee_name_original: transaction.import_payee_name_original,
          } : null,
          matched_transaction_id: transaction.matched_transaction_id,
          debt_transaction_type: transaction.debt_transaction_type,
        };

        // Add subtransactions if they exist and are requested
        if (input.include_subtransactions && transaction.subtransactions && transaction.subtransactions.length > 0) {
          return {
            ...baseTransaction,
            subtransactions: transaction.subtransactions.map(sub => ({
              id: sub.id,
              transaction_id: sub.transaction_id,
              amount: {
                milliunits: sub.amount,
                formatted: this.formatCurrency(sub.amount),
              },
              memo: sub.memo,
              payee: {
                id: sub.payee_id,
                name: sub.payee_name,
              },
              category: {
                id: sub.category_id,
                name: sub.category_name,
              },
              transfer: sub.transfer_account_id ? {
                account_id: sub.transfer_account_id,
                transaction_id: sub.transfer_transaction_id,
              } : null,
            })),
          };
        }

        return baseTransaction;
      });

      // Sort transactions by date (newest first)
      const sortedTransactions = processedTransactions.sort((a, b) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      return {
        transactions: sortedTransactions,
        server_knowledge: transactionsResponse.server_knowledge,
        filtered_count: sortedTransactions.length,
        has_more: input.limit ? sortedTransactions.length === input.limit : false,
      };

    } catch (error) {
      this.handleError(error, 'get transactions');
    }
  }
}