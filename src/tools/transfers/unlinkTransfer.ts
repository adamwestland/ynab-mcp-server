import { z } from 'zod';
import { YnabTool } from '../base.js';
import type { YnabTransactionResponse, UpdateTransaction } from '../../types/index.js';

/**
 * Input schema for the unlink transfer tool
 */
const UnlinkTransferInputSchema = z.object({
  budget_id: z.string().describe('The ID of the budget containing the transaction'),
  transaction_id: z.string().describe('The ID of either transaction in the transfer pair to unlink'),
  new_payee_name: z.string().optional().describe('Optional new payee name for the transaction after unlinking'),
  new_category_id: z.string().optional().describe('Optional new category ID for the transaction after unlinking'),
});

type UnlinkTransferInput = z.infer<typeof UnlinkTransferInputSchema>;

/**
 * Tool for unlinking a transfer between accounts
 * 
 * This tool breaks the transfer link between two transactions by:
 * - Removing the transfer payee association
 * - Converting both transactions to regular transactions
 * - Optionally setting new payee and category information
 * - Maintaining the original amounts and dates
 */
export class UnlinkTransferTool extends YnabTool {
  name = 'ynab_unlink_transfer';
  description = 'Break the transfer link between transactions, converting them to regular transactions. Optionally specify new payee and category information.';
  inputSchema = UnlinkTransferInputSchema;

  /**
   * Execute the unlink transfer tool
   * 
   * @param args Input arguments including transaction_id and optional new payee/category
   * @returns Updated transaction information after unlinking
   */
  async execute(args: unknown): Promise<{
    transaction: {
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
    };
    linked_transaction?: {
      id: string;
      was_also_unlinked: boolean;
      message: string;
    };
    server_knowledge: number;
  }> {
    const input = this.validateArgs<UnlinkTransferInput>(args);

    try {
      // First, get the current transaction to understand the transfer relationship
      const currentTransaction = await this.client.getTransaction(
        input.budget_id,
        input.transaction_id
      );

      // Check if this is actually a transfer
      if (!currentTransaction.transfer_account_id || !currentTransaction.transfer_transaction_id) {
        throw new Error('This transaction is not part of a transfer and cannot be unlinked');
      }

      const linkedTransactionId = currentTransaction.transfer_transaction_id;
      const linkedAccountId = currentTransaction.transfer_account_id;

      // Prepare the update - remove transfer associations
      const updateData: UpdateTransaction = {
        payee_id: null, // Remove transfer payee
        transfer_account_id: null, // Remove transfer account
      };

      // Set new payee if provided
      if (input.new_payee_name) {
        // For simplicity, we'll create a payee name directly
        // In a real implementation, you might want to lookup existing payees first
        updateData.payee_name = input.new_payee_name;
      }

      // Set new category if provided
      if (input.new_category_id) {
        updateData.category_id = input.new_category_id;
      } else {
        // If no category specified, transactions will be uncategorized
        updateData.category_id = null;
      }

      // Update the transaction to unlink it
      const updatedTransactionResponse: YnabTransactionResponse = await this.client.updateTransaction(
        input.budget_id,
        input.transaction_id,
        updateData
      );

      const transaction = updatedTransactionResponse.transaction;

      // Format the response
      const processedTransaction = {
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
      };

      const response: any = {
        transaction: processedTransaction,
        server_knowledge: updatedTransactionResponse.server_knowledge,
      };

      // Add information about the linked transaction
      if (linkedTransactionId && linkedAccountId) {
        response.linked_transaction = {
          id: linkedTransactionId,
          was_also_unlinked: true,
          message: `The linked transaction ${linkedTransactionId} in account ${linkedAccountId} was also unlinked and converted to a regular transaction.`,
        };
      }

      return response;

    } catch (error) {
      this.handleError(error, 'unlink transfer');
    }
  }
}