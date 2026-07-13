import { z } from 'zod';
import { YnabTool } from '../base.js';
import { YNABError } from '../../client/ErrorHandler.js';

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
 * - Re-fetches the schedule after deleting to verify the delete took effect:
 *   YNAB's DELETE endpoint is idempotent and returns 200 even when nothing
 *   was removed, so the HTTP status alone is not a trustworthy success signal
 */
export class DeleteScheduledTransactionTool extends YnabTool {
  name = 'ynab_delete_scheduled_transaction';
  description = 'Permanently delete a scheduled transaction. This stops all future occurrences but does not affect already created transactions. Cannot be undone. Verifies the deletion took effect and reports deleted: false if YNAB silently ignored the request.';
  inputSchema = DeleteScheduledTransactionInputSchema;

  /**
   * Execute the delete scheduled transaction tool
   * 
   * @param args Input arguments including budget_id and scheduled_transaction_id
   * @returns Confirmation of deletion with summary of what was removed
   */
  async execute(args: unknown): Promise<{
    deleted: boolean;
    verified: boolean;
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

      // YNAB's DELETE is idempotent: it returns 200 with the entity in the
      // body even when nothing was actually removed (observed in production
      // where a live schedule survived two consecutive 200 responses). A
      // follow-up GET is the only reliable signal: 404 or a tombstone means
      // the schedule is gone; a live entity means YNAB ignored the delete.
      let verified = false;
      let stillExists = false;
      try {
        const afterDelete = await this.client.getScheduledTransaction(
          input.budget_id,
          input.scheduled_transaction_id
        );
        if (afterDelete.deleted) {
          verified = true;
        } else {
          stillExists = true;
        }
      } catch (verifyError) {
        if (verifyError instanceof YNABError && verifyError.type === 'not_found') {
          verified = true;
        }
        // Any other verification failure (network, rate limit): the DELETE
        // itself returned success, so report deleted but unverified rather
        // than failing the whole operation.
      }

      if (stillExists) {
        return {
          deleted: false,
          verified: true,
          scheduled_transaction_id: input.scheduled_transaction_id,
          summary: transactionSummary,
          warning: 'YNAB returned success for the delete request, but the scheduled transaction still exists. The API silently ignored the request. Retry the deletion, or delete the schedule in the YNAB app, then confirm with a full (non-delta) ynab_get_scheduled_transactions fetch.',
        };
      }

      // Generate appropriate warning message
      let warningMessage = verified
        ? 'This scheduled transaction has been permanently deleted and cannot be recovered.'
        : 'The delete request succeeded but the deletion could not be verified (the confirmation fetch failed). Confirm with a full (non-delta) ynab_get_scheduled_transactions fetch.';

      if (scheduledTransaction.date_next && new Date(scheduledTransaction.date_next) > new Date()) {
        warningMessage += ` Future transactions scheduled for ${this.formatDate(scheduledTransaction.date_next)} and beyond will no longer be created.`;
      }

      if (scheduledTransaction.completed_transactions > 0) {
        warningMessage += ` The ${scheduledTransaction.completed_transactions} transaction(s) that were already created from this schedule remain in your budget.`;
      }

      return {
        deleted: true,
        verified,
        scheduled_transaction_id: input.scheduled_transaction_id,
        summary: transactionSummary,
        warning: warningMessage,
      };

    } catch (error) {
      this.handleError(error, 'delete scheduled transaction');
    }
  }
}