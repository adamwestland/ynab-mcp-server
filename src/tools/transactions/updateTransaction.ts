import { z } from 'zod';
import { YnabTool } from '../base.js';
import type { YnabTransactionsResponse, YnabPayeesResponse, UpdateTransactionWithId } from '../../types/index.js';

/**
 * Input schema for the update transaction tool
 */
const UpdateTransactionInputSchema = z.object({
  budget_id: z.string().describe('The ID of the budget containing the transaction'),
  transaction_id: z.string().describe('The ID of the transaction to update'),
  account_id: z.string().optional().describe('Move transaction to a different account'),
  category_id: z.string().nullable().optional().describe('Update the category ID. Use null for transfers or to clear category'),
  payee_id: z.string().nullable().optional().describe('Update the payee ID. Use null to clear payee'),
  payee_name: z.string().optional().describe('Update payee name - will create payee if not exists. Takes precedence over payee_id'),
  amount: z.number().int().optional().describe('Update transaction amount in milliunits. Negative for outflows, positive for inflows'),
  memo: z.string().nullable().optional().describe('Update memo/description. Use null to clear memo'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Update transaction date in YYYY-MM-DD format'),
  cleared: z.enum(['cleared', 'uncleared', 'reconciled']).optional().describe('Update cleared status'),
  approved: z.boolean().optional().describe('Update approval status'),
  flag_color: z.enum(['red', 'orange', 'yellow', 'green', 'blue', 'purple']).nullable().optional().describe('Update flag color. Use null to clear flag'),
  import_id: z.string().nullable().optional().describe('Update import ID. Use null to clear import ID'),
});

type UpdateTransactionInput = z.infer<typeof UpdateTransactionInputSchema>;

/**
 * Tool for updating an existing transaction in YNAB
 * 
 * This tool allows updating any field of an existing transaction:
 * - All fields are optional except transaction_id and budget_id
 * - Supports payee creation if payee_name is provided
 * - Can clear fields by setting them to null
 * - Handles transfer clearing by setting category_id to null
 * - Validates amounts and dates when provided
 */
export class UpdateTransactionTool extends YnabTool {
  name = 'ynab_update_transaction';
  description = 'Update an existing transaction in YNAB. All fields are optional except transaction_id. Supports clearing fields with null values, payee creation, and transfer handling.';
  inputSchema = UpdateTransactionInputSchema;

  /**
   * Execute the update transaction tool
   * 
   * @param args Input arguments for updating the transaction
   * @returns Updated transaction details
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
      flag: {
        color: string | null;
        name: string | null;
      } | null;
      import_id: string | null;
      is_transfer: boolean;
    };
    created_payee: {
      id: string;
      name: string;
    } | null;
    server_knowledge: number;
    changes_made: string[];
  }> {
    const input = this.validateArgs<UpdateTransactionInput>(args);

    try {
      let payeeId = input.payee_id;
      let createdPayee = null;
      const changesMade: string[] = [];

      // Handle payee creation if payee_name is provided
      if (input.payee_name !== undefined && !input.payee_id) {
        try {
          // Check if payee already exists
          const payeesResponse: YnabPayeesResponse = await this.client.getPayees(input.budget_id);
          const existingPayee = payeesResponse.payees.find(
            payee => payee.name.toLowerCase() === input.payee_name!.toLowerCase()
          );

          if (existingPayee) {
            payeeId = existingPayee.id;
            changesMade.push(`Used existing payee: ${existingPayee.name}`);
          } else {
            // Create new payee
            const newPayeeResponse = await this.client.post<{ payee: { id: string; name: string } }>(
              `/budgets/${input.budget_id}/payees`,
              {
                payee: {
                  name: input.payee_name,
                },
              }
            );
            payeeId = newPayeeResponse.payee.id;
            createdPayee = {
              id: newPayeeResponse.payee.id,
              name: newPayeeResponse.payee.name,
            };
            changesMade.push(`Created new payee: ${newPayeeResponse.payee.name}`);
          }
        } catch (payeeError) {
          console.warn('Failed to handle payee, continuing with update:', payeeError);
          changesMade.push('Warning: Failed to handle payee creation/lookup');
        }
      }

      // Build update data - only include fields that were provided
      const updateData: UpdateTransactionWithId = {
        id: input.transaction_id,
      };

      if (input.account_id !== undefined) {
        updateData.account_id = input.account_id;
        changesMade.push('Updated account');
      }

      if (input.category_id !== undefined) {
        updateData.category_id = input.category_id;
        changesMade.push(input.category_id === null ? 'Cleared category (transfer)' : 'Updated category');
      }

      if (payeeId !== undefined || input.payee_id !== undefined) {
        updateData.payee_id = payeeId ?? input.payee_id ?? null;
        changesMade.push(updateData.payee_id === null ? 'Cleared payee' : 'Updated payee');
      }

      if (input.amount !== undefined) {
        updateData.amount = input.amount;
        changesMade.push('Updated amount');
      }

      if (input.memo !== undefined) {
        updateData.memo = input.memo;
        changesMade.push(input.memo === null ? 'Cleared memo' : 'Updated memo');
      }

      if (input.date !== undefined) {
        updateData.date = input.date;
        changesMade.push('Updated date');
      }

      if (input.cleared !== undefined) {
        updateData.cleared = input.cleared;
        changesMade.push(`Updated cleared status to: ${input.cleared}`);
      }

      if (input.approved !== undefined) {
        updateData.approved = input.approved;
        changesMade.push(`${input.approved ? 'Approved' : 'Unapproved'} transaction`);
      }

      if (input.flag_color !== undefined) {
        updateData.flag_color = input.flag_color;
        changesMade.push(input.flag_color === null ? 'Cleared flag' : `Set flag to: ${input.flag_color}`);
      }

      if (input.import_id !== undefined) {
        // Validate import_id format if provided
        if (input.import_id && input.import_id.length > 36) {
          throw new Error('Import ID must be 36 characters or less');
        }
        updateData.import_id = input.import_id;
        changesMade.push(input.import_id === null ? 'Cleared import ID' : 'Updated import ID');
      }

      // If no changes were made, throw an error
      if (Object.keys(updateData).length === 1) { // Only the ID was set
        throw new Error('No fields provided to update. At least one field besides transaction_id must be specified.');
      }

      // Update the transaction
      const response: YnabTransactionsResponse = await this.client.updateTransactions(
        input.budget_id,
        [updateData]
      );

      if (!response.transactions || response.transactions.length === 0) {
        throw new Error('No transaction returned from YNAB API after update');
      }

      const transaction = response.transactions[0]!;

      // Determine if this is a transfer transaction
      const isTransfer = !transaction.category_id && !!transaction.transfer_account_id;

      return {
        transaction: {
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
          import_id: transaction.import_id,
          is_transfer: isTransfer,
        },
        created_payee: createdPayee,
        server_knowledge: response.server_knowledge,
        changes_made: changesMade,
      };

    } catch (error) {
      this.handleError(error, 'update transaction');
    }
  }
}