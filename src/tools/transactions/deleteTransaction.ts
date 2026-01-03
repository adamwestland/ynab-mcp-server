import { z } from 'zod';
import { YnabTool } from '../base.js';

/**
 * Input schema for the delete transaction tool
 */
const DeleteTransactionInputSchema = z.object({
  budget_id: z.string().describe('The ID of the budget containing the transaction'),
  transaction_id: z.string().describe('The ID of the transaction to delete'),
});

type DeleteTransactionInput = z.infer<typeof DeleteTransactionInputSchema>;

/**
 * Tool for deleting a transaction in YNAB
 * 
 * This tool permanently deletes a transaction from YNAB.
 * Warning: This operation cannot be undone. The transaction will be completely
 * removed from the budget including all historical data.
 */
export class DeleteTransactionTool extends YnabTool {
  name = 'ynab_delete_transaction';
  description = 'Permanently delete a transaction from YNAB. This operation cannot be undone and will remove the transaction completely from the budget.';
  inputSchema = DeleteTransactionInputSchema;

  /**
   * Execute the delete transaction tool
   * 
   * @param args Input arguments for deleting the transaction
   * @returns Confirmation of deletion with deleted transaction details
   */
  async execute(args: unknown): Promise<{
    deleted_transaction: {
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
      import_id: string | null;
      is_transfer: boolean;
      had_subtransactions: boolean;
    };
    deletion_confirmed: boolean;
    server_knowledge: number;
  }> {
    const input = this.validateArgs<DeleteTransactionInput>(args);

    try {
      // First, get the transaction details before deleting it
      let transactionToDelete;
      try {
        const transactionResponse = await this.client.getTransactions(
          input.budget_id,
          { sinceDate: '1900-01-01' } // Get all transactions to find the specific one
        );
        
        transactionToDelete = transactionResponse.transactions.find(t => t.id === input.transaction_id);
        
        if (!transactionToDelete) {
          throw new Error(`Transaction with ID ${input.transaction_id} not found in budget ${input.budget_id}`);
        }
      } catch (error) {
        throw new Error(`Failed to retrieve transaction before deletion: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Store transaction details before deletion
      const hadSubtransactions = !!(transactionToDelete.subtransactions && transactionToDelete.subtransactions.length > 0);
      const isTransfer = !transactionToDelete.category_id && !!transactionToDelete.transfer_account_id;

      // Delete the transaction
      const deleteResponse = await this.client.delete<{
        transaction: {
          id: string;
          account_id: string;
          deleted: boolean;
        };
        server_knowledge: number;
      }>(`/budgets/${input.budget_id}/transactions/${input.transaction_id}`);

      // Verify deletion was successful
      if (!deleteResponse.transaction || !deleteResponse.transaction.deleted) {
        throw new Error('Transaction deletion was not confirmed by YNAB API');
      }

      return {
        deleted_transaction: {
          id: transactionToDelete.id,
          date: transactionToDelete.date,
          amount: {
            milliunits: transactionToDelete.amount,
            formatted: this.formatCurrency(transactionToDelete.amount),
          },
          memo: transactionToDelete.memo,
          payee: {
            id: transactionToDelete.payee_id,
            name: transactionToDelete.payee_name,
          },
          category: {
            id: transactionToDelete.category_id,
            name: transactionToDelete.category_name,
          },
          account: {
            id: transactionToDelete.account_id,
            name: transactionToDelete.account_name,
          },
          transfer: transactionToDelete.transfer_account_id ? {
            account_id: transactionToDelete.transfer_account_id,
            transaction_id: transactionToDelete.transfer_transaction_id,
          } : null,
          cleared: transactionToDelete.cleared,
          approved: transactionToDelete.approved,
          flag: (transactionToDelete.flag_color || transactionToDelete.flag_name) ? {
            color: transactionToDelete.flag_color,
            name: transactionToDelete.flag_name,
          } : null,
          import_id: transactionToDelete.import_id,
          is_transfer: isTransfer,
          had_subtransactions: hadSubtransactions,
        },
        deletion_confirmed: true,
        server_knowledge: deleteResponse.server_knowledge,
      };

    } catch (error) {
      this.handleError(error, 'delete transaction');
    }
  }
}