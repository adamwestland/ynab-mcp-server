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
 * How many times to re-check the schedule after a DELETE before concluding
 * YNAB silently ignored the request. A freshly-issued delete can briefly lag
 * before the read side reflects it, so a single immediate re-fetch could
 * report a successful delete as ignored — which would wrongly tell the user to
 * retry a destructive operation that already worked.
 */
const VERIFY_MAX_ATTEMPTS = 3;

/** Base backoff between verification re-checks; grows linearly per attempt. */
const VERIFY_BACKOFF_MS = 300;

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

  /** Resolve after `ms` milliseconds (used to space out verification re-checks). */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

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
      // Because the read side can briefly lag a just-issued delete, re-check a
      // few times with a short backoff before concluding it was ignored — a
      // single immediate fetch could flag a successful delete as a no-op and
      // wrongly prompt the user to retry a destructive operation.
      let verifyOutcome: 'gone' | 'exists' | 'unverified' = 'unverified';
      for (let attempt = 1; attempt <= VERIFY_MAX_ATTEMPTS; attempt++) {
        try {
          const afterDelete = await this.client.getScheduledTransaction(
            input.budget_id,
            input.scheduled_transaction_id
          );
          verifyOutcome = afterDelete.deleted ? 'gone' : 'exists';
        } catch (verifyError) {
          // 404 confirms the delete. Any other failure (network, rate limit)
          // leaves it unverified: the DELETE itself returned success, so report
          // deleted-but-unverified rather than failing the whole operation.
          verifyOutcome =
            verifyError instanceof YNABError && verifyError.type === 'not_found'
              ? 'gone'
              : 'unverified';
          break;
        }
        if (verifyOutcome === 'gone') {
          break;
        }
        // Still present — could be read-after-write lag; wait and re-check.
        if (attempt < VERIFY_MAX_ATTEMPTS) {
          await this.delay(VERIFY_BACKOFF_MS * attempt);
        }
      }

      if (verifyOutcome === 'exists') {
        return {
          deleted: false,
          verified: true,
          scheduled_transaction_id: input.scheduled_transaction_id,
          summary: transactionSummary,
          warning: `YNAB returned success for the delete request, but the scheduled transaction still exists after ${VERIFY_MAX_ATTEMPTS} verification checks. The API silently ignored the request. Retry the deletion, or delete the schedule in the YNAB app, then confirm with a full (non-delta) ynab_get_scheduled_transactions fetch.`,
        };
      }

      const verified = verifyOutcome === 'gone';

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