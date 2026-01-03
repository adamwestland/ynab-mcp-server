import { z } from 'zod';
import { YnabTool } from '../base.js';

/**
 * Input schema for the delete scheduled transaction tool
 */
const DeleteScheduledTransactionInputSchema = z.object({
  budget_id: z.string().describe('The ID of the budget containing the scheduled transaction'),
  scheduled_transaction_id: z.string().describe('The ID of the scheduled transaction to delete'),
});

type DeleteScheduledTransactionInput = z.infer<typeof DeleteScheduledTransactionInputSchema>;

/**
 * Tool for deleting a scheduled transaction
 * 
 * This tool permanently removes a scheduled transaction from the budget:
 * - Stops all future occurrences of the transaction
 * - Does not affect any transactions that have already been created from this schedule
 * - Cannot be undone - the scheduled transaction must be recreated if needed
 * - Provides confirmation of deletion with summary of what was removed
 */
export class DeleteScheduledTransactionTool extends YnabTool {
  name = 'ynab_delete_scheduled_transaction';
  description = 'Permanently delete a scheduled transaction. This stops all future occurrences but does not affect already created transactions. Cannot be undone.';
  inputSchema = DeleteScheduledTransactionInputSchema;

  /**
   * Execute the delete scheduled transaction tool
   * 
   * @param args Input arguments including budget_id and scheduled_transaction_id
   * @returns Confirmation of deletion with summary of what was removed
   */
  async execute(args: unknown): Promise<{
    deleted: boolean;
    scheduled_transaction_id: string;
    summary: {
      frequency: string;
      amount: {
        milliunits: number;
        formatted: string;
      };
      payee_name: string | null;
      category_name: string | null;
      account_name: string;
      memo: string | null;
      date_first: string;
      date_next: string | null;
      completed_transactions: number;
    };
    warning: string;
  }> {
    const input = this.validateArgs<DeleteScheduledTransactionInput>(args);

    try {
      // First get the scheduled transaction details for confirmation
      const scheduledTransaction = await this.client.getScheduledTransaction(
        input.budget_id,
        input.scheduled_transaction_id
      );

      // Store details before deletion
      const transactionSummary = {
        frequency: scheduledTransaction.frequency,
        amount: {
          milliunits: scheduledTransaction.amount,
          formatted: this.formatCurrency(scheduledTransaction.amount),
        },
        payee_name: scheduledTransaction.payee_name,
        category_name: scheduledTransaction.category_name,
        account_name: scheduledTransaction.account_name,
        memo: scheduledTransaction.memo,
        date_first: scheduledTransaction.date_first,
        date_next: scheduledTransaction.date_next,
        completed_transactions: scheduledTransaction.completed_transactions,
      };

      // Delete the scheduled transaction
      await this.client.deleteScheduledTransaction(
        input.budget_id,
        input.scheduled_transaction_id
      );

      // Generate appropriate warning message
      let warningMessage = 'This scheduled transaction has been permanently deleted and cannot be recovered.';
      
      if (scheduledTransaction.date_next && new Date(scheduledTransaction.date_next) > new Date()) {
        warningMessage += ` Future transactions scheduled for ${this.formatDate(scheduledTransaction.date_next)} and beyond will no longer be created.`;
      }

      if (scheduledTransaction.completed_transactions > 0) {
        warningMessage += ` The ${scheduledTransaction.completed_transactions} transaction(s) that were already created from this schedule remain in your budget.`;
      }

      return {
        deleted: true,
        scheduled_transaction_id: input.scheduled_transaction_id,
        summary: transactionSummary,
        warning: warningMessage,
      };

    } catch (error) {
      this.handleError(error, 'delete scheduled transaction');
    }
  }
}