import { z } from 'zod';
import { YnabTool } from '../base.js';
import type { YnabScheduledTransaction } from '../../types/index.js';

/**
 * Input schema for the get scheduled transaction tool
 */
const GetScheduledTransactionInputSchema = z.object({
  budget_id: z.string().describe('The ID of the budget containing the scheduled transaction'),
  scheduled_transaction_id: z.string().describe('The ID of the scheduled transaction to retrieve'),
});

type GetScheduledTransactionInput = z.infer<typeof GetScheduledTransactionInputSchema>;

/**
 * Tool for getting a specific scheduled transaction by ID
 * 
 * This tool retrieves detailed information about a single scheduled transaction including:
 * - Complete scheduling information (frequency, next occurrence, history)
 * - Transaction details (amount, memo, payee, category)
 * - Account and transfer information
 * - Subtransactions for split scheduled transactions
 * - Upcoming transaction previews
 * - Flag and status information
 */
export class GetScheduledTransactionTool extends YnabTool {
  name = 'ynab_get_scheduled_transaction';
  description = 'Get detailed information about a specific scheduled transaction by ID. Returns complete scheduling data, transaction details, and upcoming transaction previews.';
  inputSchema = GetScheduledTransactionInputSchema;

  /**
   * Execute the get scheduled transaction tool
   * 
   * @param args Input arguments including budget_id and scheduled_transaction_id
   * @returns Detailed scheduled transaction information
   */
  async execute(args: unknown): Promise<{
    id: string;
    date_first: string;
    frequency: {
      type: string;
      display_name: string;
    };
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
      is_active: boolean;
    };
    upcoming_transactions?: Array<{
      id: string;
      date: string;
      amount: {
        milliunits: number;
        formatted: string;
      };
      memo: string | null;
    }>;
    subtransactions?: Array<{
      id: string;
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
  }> {
    const input = this.validateArgs<GetScheduledTransactionInput>(args);

    try {
      const scheduledTransaction: YnabScheduledTransaction = await this.client.getScheduledTransaction(
        input.budget_id,
        input.scheduled_transaction_id
      );

      // Map frequency to display names
      const frequencyDisplayNames: Record<string, string> = {
        'never': 'Never',
        'daily': 'Daily',
        'weekly': 'Weekly',
        'everyOtherWeek': 'Every Other Week',
        'twiceAMonth': 'Twice a Month',
        'monthly': 'Monthly',
        'everyOtherMonth': 'Every Other Month',
        'everyThreeMonths': 'Every 3 Months',
        'everyFourMonths': 'Every 4 Months',
        'twiceAYear': 'Twice a Year',
        'yearly': 'Yearly',
        'everyOtherYear': 'Every Other Year',
      };

      const result = {
        id: scheduledTransaction.id,
        date_first: scheduledTransaction.date_first,
        frequency: {
          type: scheduledTransaction.frequency,
          display_name: frequencyDisplayNames[scheduledTransaction.frequency] || scheduledTransaction.frequency,
        },
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
          is_active: scheduledTransaction.frequency !== 'never' && scheduledTransaction.date_next !== null,
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
          memo: upcoming.memo,
        }));

        return {
          ...result,
          upcoming_transactions: upcomingTransactionsFormatted,
        };
      }

      // Add subtransactions if they exist
      if (scheduledTransaction.subtransactions && scheduledTransaction.subtransactions.length > 0) {
        const subtransactionsFormatted = scheduledTransaction.subtransactions.map(sub => ({
          id: sub.id,
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
          ...result,
          subtransactions: subtransactionsFormatted,
        };
      }

      return result;

    } catch (error) {
      this.handleError(error, 'get scheduled transaction');
    }
  }
}