import { z } from 'zod';
import { YnabTool } from '../base.js';
import type { YnabScheduledTransactionsResponse } from '../../types/index.js';

/**
 * Input schema for the get scheduled transactions tool
 */
const GetScheduledTransactionsInputSchema = z.object({
  budget_id: z.string().describe('The ID of the budget to get scheduled transactions for'),
  last_knowledge_of_server: z.number().optional().describe('Server knowledge for delta sync - only return data modified since this value'),
});

type GetScheduledTransactionsInput = z.infer<typeof GetScheduledTransactionsInputSchema>;

/**
 * Tool for getting all scheduled transactions for a budget
 * 
 * This tool retrieves scheduled transaction information including:
 * - Recurring transaction details (date_first, frequency, amount)
 * - Payee and category information
 * - Account information
 * - Next occurrence dates and completed transaction counts
 * - Subtransactions for split scheduled transactions
 * - Flag information
 * - Upcoming transactions preview
 */
export class GetScheduledTransactionsTool extends YnabTool {
  name = 'ynab_get_scheduled_transactions';
  description = 'Get all scheduled (recurring) transactions for a budget with delta sync support. Returns comprehensive scheduling information including frequency, next dates, and upcoming transaction previews.';
  inputSchema = GetScheduledTransactionsInputSchema;

  /**
   * Execute the get scheduled transactions tool
   * 
   * @param args Input arguments including budget_id and optional sync parameters
   * @returns Scheduled transaction details with comprehensive metadata
   */
  async execute(args: unknown): Promise<{
    scheduled_transactions: Array<{
      id: string;
      date_first: string;
      frequency: string;
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
      } | null;
      flag: {
        color: string | null;
        name: string | null;
      } | null;
      scheduling: {
        date_last: string | null;
        date_next: string | null;
        completed_transactions: number;
      };
      upcoming_transactions?: Array<{
        id: string;
        date: string;
        amount: {
          milliunits: number;
          formatted: string;
        };
      }>;
      subtransactions?: Array<{
        id: string;
        scheduled_transaction_id: string;
        amount: {
          milliunits: number;
          formatted: string;
        };
        memo: string | null;
        payee: {
          id: string | null;
        };
        category: {
          id: string | null;
        };
        transfer: {
          account_id: string | null;
        } | null;
      }>;
    }>;
    server_knowledge: number;
    total_count: number;
  }> {
    const input = this.validateArgs<GetScheduledTransactionsInput>(args);

    try {
      const scheduledTransactionsResponse: YnabScheduledTransactionsResponse = await this.client.getScheduledTransactions(
        input.budget_id,
        input.last_knowledge_of_server
      );

      // Process and format scheduled transaction data
      const processedScheduledTransactions = scheduledTransactionsResponse.scheduled_transactions.map(scheduledTransaction => {
        const baseScheduledTransaction = {
          id: scheduledTransaction.id,
          date_first: scheduledTransaction.date_first,
          frequency: scheduledTransaction.frequency,
          amount: {
            milliunits: scheduledTransaction.amount,
            formatted: this.formatCurrency(scheduledTransaction.amount),
          },
          memo: scheduledTransaction.memo,
          payee: {
            id: scheduledTransaction.payee_id,
            name: scheduledTransaction.payee_name,
          },
          category: {
            id: scheduledTransaction.category_id,
            name: scheduledTransaction.category_name,
          },
          account: {
            id: scheduledTransaction.account_id,
            name: scheduledTransaction.account_name,
          },
          transfer: scheduledTransaction.transfer_account_id ? {
            account_id: scheduledTransaction.transfer_account_id,
          } : null,
          flag: (scheduledTransaction.flag_color || scheduledTransaction.flag_name) ? {
            color: scheduledTransaction.flag_color,
            name: scheduledTransaction.flag_name,
          } : null,
          scheduling: {
            date_last: scheduledTransaction.date_last,
            date_next: scheduledTransaction.date_next,
            completed_transactions: scheduledTransaction.completed_transactions,
          },
        };

        // Add upcoming transactions if they exist
        if (scheduledTransaction.upcoming_transactions && scheduledTransaction.upcoming_transactions.length > 0) {
          const upcomingTransactionsFormatted = scheduledTransaction.upcoming_transactions.map(upcoming => ({
            id: upcoming.id,
            date: upcoming.date,
            amount: {
              milliunits: upcoming.amount,
              formatted: this.formatCurrency(upcoming.amount),
            },
          }));

          return {
            ...baseScheduledTransaction,
            upcoming_transactions: upcomingTransactionsFormatted,
          };
        }

        // Add subtransactions if they exist
        if (scheduledTransaction.subtransactions && scheduledTransaction.subtransactions.length > 0) {
          const subtransactionsFormatted = scheduledTransaction.subtransactions.map(sub => ({
            id: sub.id,
            scheduled_transaction_id: sub.scheduled_transaction_id,
            amount: {
              milliunits: sub.amount,
              formatted: this.formatCurrency(sub.amount),
            },
            memo: sub.memo,
            payee: {
              id: sub.payee_id,
            },
            category: {
              id: sub.category_id,
            },
            transfer: sub.transfer_account_id ? {
              account_id: sub.transfer_account_id,
            } : null,
          }));

          return {
            ...baseScheduledTransaction,
            subtransactions: subtransactionsFormatted,
          };
        }

        return baseScheduledTransaction;
      });

      // Sort scheduled transactions by date_first (newest first)
      const sortedScheduledTransactions = processedScheduledTransactions.sort((a, b) => 
        new Date(b.date_first).getTime() - new Date(a.date_first).getTime()
      );

      return {
        scheduled_transactions: sortedScheduledTransactions,
        server_knowledge: scheduledTransactionsResponse.server_knowledge,
        total_count: sortedScheduledTransactions.length,
      };

    } catch (error) {
      this.handleError(error, 'get scheduled transactions');
    }
  }
}