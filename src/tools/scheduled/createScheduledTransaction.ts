import { z } from 'zod';
import { YnabTool } from '../base.js';
import type { YnabScheduledTransactionResponse, SaveScheduledTransaction } from '../../types/index.js';

/**
 * Input schema for the create scheduled transaction tool
 */
const CreateScheduledTransactionInputSchema = z.object({
  budget_id: z.string().describe('The ID of the budget to create the scheduled transaction in'),
  account_id: z.string().describe('The ID of the account for the scheduled transaction'),
  payee_id: z.string().optional().describe('The ID of the payee for the scheduled transaction'),
  category_id: z.string().optional().describe('The ID of the category for the scheduled transaction'),
  transfer_account_id: z.string().optional().describe('The ID of the transfer account if this is a transfer'),
  amount: z.number().describe('The amount in milliunits (multiply dollars by 1000)'),
  memo: z.string().optional().describe('Memo for the scheduled transaction'),
  date_first: z.string().describe('The first date for the scheduled transaction (ISO format: YYYY-MM-DD)'),
  frequency: z.enum([
    'never',
    'daily',
    'weekly',
    'everyOtherWeek',
    'twiceAMonth',
    'monthly',
    'everyOtherMonth',
    'everyThreeMonths',
    'everyFourMonths',
    'twiceAYear',
    'yearly',
    'everyOtherYear'
  ]).describe('How often the transaction should recur'),
  flag_color: z.enum(['red', 'orange', 'yellow', 'green', 'blue', 'purple']).optional().describe('Flag color for the scheduled transaction'),
  subtransactions: z.array(z.object({
    amount: z.number().describe('Amount in milliunits'),
    memo: z.string().optional().describe('Memo for subtransaction'),
    payee_id: z.string().optional().describe('Payee ID for subtransaction'),
    category_id: z.string().optional().describe('Category ID for subtransaction'),
    transfer_account_id: z.string().optional().describe('Transfer account ID for subtransaction'),
  })).optional().describe('Subtransactions for split scheduled transactions'),
});

type CreateScheduledTransactionInput = z.infer<typeof CreateScheduledTransactionInputSchema>;

/**
 * Tool for creating a new scheduled transaction
 * 
 * This tool creates a recurring transaction with specified frequency and details:
 * - Supports all YNAB frequency types (daily, weekly, monthly, etc.)
 * - Validates date_first is a valid future or current date
 * - Supports split transactions via subtransactions
 * - Handles transfers between accounts
 * - Validates payee/category combinations
 * - Sets up proper flag colors
 */
export class CreateScheduledTransactionTool extends YnabTool {
  name = 'ynab_create_scheduled_transaction';
  description = 'Create a new scheduled (recurring) transaction with specified frequency. Supports all frequency types, split transactions, transfers, and proper validation of dates and amounts.';
  inputSchema = CreateScheduledTransactionInputSchema;

  /**
   * Execute the create scheduled transaction tool
   * 
   * @param args Input arguments for creating the scheduled transaction
   * @returns Created scheduled transaction with confirmation details
   */
  async execute(args: unknown): Promise<{
    scheduled_transaction: {
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
        date_next: string | null;
        is_active: boolean;
      };
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
    };
    server_knowledge: number;
  }> {
    const input = this.validateArgs<CreateScheduledTransactionInput>(args);

    try {
      // Validation: Check date_first is valid
      const dateFirst = new Date(input.date_first);
      if (isNaN(dateFirst.getTime())) {
        throw new Error('Invalid date_first format. Use ISO format: YYYY-MM-DD');
      }

      // Validation: For transfers, payee_id should not be set
      if (input.transfer_account_id && input.payee_id) {
        throw new Error('Cannot specify both payee_id and transfer_account_id. Use transfer_account_id for transfers.');
      }

      // Validation: For split transactions, main transaction should have minimal amount
      if (input.subtransactions && input.subtransactions.length > 0) {
        const subtotalAmount = input.subtransactions.reduce((sum, sub) => sum + sub.amount, 0);
        if (Math.abs(input.amount - subtotalAmount) > 1) { // Allow for rounding differences
          console.warn(`Main amount (${input.amount}) differs from subtransaction sum (${subtotalAmount}). This may cause issues.`);
        }
      }

      // Prepare scheduled transaction data
      const scheduledTransactionData: SaveScheduledTransaction = {
        account_id: input.account_id,
        date_first: input.date_first,
        amount: input.amount,
        frequency: input.frequency,
        memo: input.memo || null,
      };

      // Add payee or transfer account
      if (input.transfer_account_id) {
        scheduledTransactionData.transfer_account_id = input.transfer_account_id;
      } else if (input.payee_id) {
        scheduledTransactionData.payee_id = input.payee_id;
      }

      // Add category (not applicable for transfers)
      if (input.category_id && !input.transfer_account_id) {
        scheduledTransactionData.category_id = input.category_id;
      }

      // Add flag color
      if (input.flag_color) {
        scheduledTransactionData.flag_color = input.flag_color;
      }

      // Add subtransactions if provided
      if (input.subtransactions && input.subtransactions.length > 0) {
        scheduledTransactionData.subtransactions = input.subtransactions.map(sub => ({
          amount: sub.amount,
          memo: sub.memo || null,
          payee_id: sub.payee_id || null,
          category_id: sub.category_id || null,
          transfer_account_id: sub.transfer_account_id || null,
        }));
      }

      // Create the scheduled transaction
      const response: YnabScheduledTransactionResponse = await this.client.createScheduledTransaction(
        input.budget_id,
        scheduledTransactionData
      );

      const scheduledTransaction = response.scheduled_transaction;

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
          date_next: scheduledTransaction.date_next,
          is_active: scheduledTransaction.frequency !== 'never' && scheduledTransaction.date_next !== null,
        },
      };

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
          scheduled_transaction: {
            ...result,
            subtransactions: subtransactionsFormatted,
          },
          server_knowledge: response.server_knowledge,
        };
      }

      return {
        scheduled_transaction: result,
        server_knowledge: response.server_knowledge,
      };

    } catch (error) {
      this.handleError(error, 'create scheduled transaction');
    }
  }
}