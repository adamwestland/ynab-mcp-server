import { z } from 'zod';
import { YnabTool } from '../base.js';
import type { YnabTransactionsResponse, YnabPayeesResponse, YnabTransaction, UpdateTransactionWithId } from '../../types/index.js';

/**
 * Schema for individual transaction update in batch
 */
const BatchTransactionUpdateSchema = z.object({
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

/**
 * Input schema for the batch update transactions tool
 */
const BatchUpdateTransactionsInputSchema = z.object({
  budget_id: z.string().describe('The ID of the budget containing the transactions'),
  transactions: z.array(BatchTransactionUpdateSchema)
    .min(1)
    .max(100)
    .describe('Array of transaction updates. Maximum 100 transactions per batch'),
  handle_duplicate_import_ids: z.boolean().optional().default(true).describe('Whether to handle duplicate import IDs by skipping duplicates'),
});

type BatchUpdateTransactionsInput = z.infer<typeof BatchUpdateTransactionsInputSchema>;
type BatchTransactionUpdate = z.infer<typeof BatchTransactionUpdateSchema>;

/**
 * Tool for batch updating multiple transactions in YNAB
 * 
 * This tool allows updating up to 100 transactions in a single request:
 * - Automatic batching if over 100 transactions provided
 * - Payee creation support for transactions with payee_name
 * - Duplicate import ID handling
 * - Individual transaction validation
 * - Comprehensive error reporting
 */
export class BatchUpdateTransactionsTool extends YnabTool {
  name = 'ynab_batch_update_transactions';
  description = 'Update multiple transactions in YNAB with a single batch request. Maximum 100 transactions per batch. Supports payee creation, duplicate handling, and comprehensive validation.';
  inputSchema = BatchUpdateTransactionsInputSchema;

  /**
   * Execute the batch update transactions tool
   * 
   * @param args Input arguments for batch updating transactions
   * @returns Results of all updated transactions with batch details
   */
  async execute(args: unknown): Promise<{
    updated_transactions: Array<{
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
    }>;
    created_payees: Array<{
      id: string;
      name: string;
    }>;
    batch_results: {
      total_requested: number;
      total_updated: number;
      total_batches: number;
      duplicate_import_ids_skipped: number;
    };
    server_knowledge: number;
    errors: Array<{
      transaction_id: string;
      error_message: string;
    }>;
  }> {
    const input = this.validateArgs<BatchUpdateTransactionsInput>(args);

    try {
      const allUpdatedTransactions: YnabTransaction[] = [];
      const allCreatedPayees: { id: string; name: string }[] = [];
      const errors: { transaction_id: string; error_message: string }[] = [];
      let duplicateImportIdsSkipped = 0;
      let finalServerKnowledge = 0;

      // Split into batches of 100
      const batches: BatchTransactionUpdate[][] = [];
      for (let i = 0; i < input.transactions.length; i += 100) {
        batches.push(input.transactions.slice(i, i + 100));
      }

      // Get existing payees once for all batches
      let existingPayees: { id: string; name: string }[] = [];
      try {
        const payeesResponse: YnabPayeesResponse = await this.client.getPayees(input.budget_id);
        existingPayees = payeesResponse.payees;
      } catch (payeeError) {
        console.warn('Failed to fetch existing payees:', payeeError);
      }

      // Process each batch
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex]!;
        const batchUpdateData: UpdateTransactionWithId[] = [];
        const batchCreatedPayees: { id: string; name: string }[] = [];

        // Process each transaction in the batch
        for (const transactionUpdate of batch) {
          try {
            let payeeId = transactionUpdate.payee_id;

            // Handle payee creation if payee_name is provided
            if (transactionUpdate.payee_name && !transactionUpdate.payee_id) {
              const existingPayee = existingPayees.find(
                payee => payee.name.toLowerCase() === transactionUpdate.payee_name!.toLowerCase()
              );

              if (existingPayee) {
                payeeId = existingPayee.id;
              } else {
                // Check if we already created this payee in this batch
                const alreadyCreated = batchCreatedPayees.find(
                  p => p.name.toLowerCase() === transactionUpdate.payee_name!.toLowerCase()
                );

                if (alreadyCreated) {
                  payeeId = alreadyCreated.id;
                } else {
                  // Create new payee
                  try {
                    const newPayeeResponse = await this.client.post<{ payee: { id: string; name: string } }>(
                      `/budgets/${input.budget_id}/payees`,
                      {
                        payee: {
                          name: transactionUpdate.payee_name,
                        },
                      }
                    );
                    payeeId = newPayeeResponse.payee.id;
                    const createdPayee = {
                      id: newPayeeResponse.payee.id,
                      name: newPayeeResponse.payee.name,
                    };
                    batchCreatedPayees.push(createdPayee);
                    existingPayees.push(createdPayee); // Add to existing payees for future batches
                  } catch (payeeError) {
                    console.warn(`Failed to create payee for transaction ${transactionUpdate.transaction_id}:`, payeeError);
                  }
                }
              }
            }

            // Validate import_id format if provided
            if (transactionUpdate.import_id && transactionUpdate.import_id.length > 36) {
              throw new Error('Import ID must be 36 characters or less');
            }

            // Build update data
            const updateData: UpdateTransactionWithId = {
              id: transactionUpdate.transaction_id,
            };

            // Only include fields that were provided
            if (transactionUpdate.account_id !== undefined) updateData.account_id = transactionUpdate.account_id;
            if (transactionUpdate.category_id !== undefined) updateData.category_id = transactionUpdate.category_id;
            if (payeeId !== undefined || transactionUpdate.payee_id !== undefined) {
              updateData.payee_id = payeeId ?? transactionUpdate.payee_id ?? null;
            }
            if (transactionUpdate.amount !== undefined) updateData.amount = transactionUpdate.amount;
            if (transactionUpdate.memo !== undefined) updateData.memo = transactionUpdate.memo;
            if (transactionUpdate.date !== undefined) updateData.date = transactionUpdate.date;
            if (transactionUpdate.cleared !== undefined) updateData.cleared = transactionUpdate.cleared;
            if (transactionUpdate.approved !== undefined) updateData.approved = transactionUpdate.approved;
            if (transactionUpdate.flag_color !== undefined) updateData.flag_color = transactionUpdate.flag_color;
            if (transactionUpdate.import_id !== undefined) updateData.import_id = transactionUpdate.import_id;

            // Skip if no actual updates (only ID)
            if (Object.keys(updateData).length === 1) {
              errors.push({
                transaction_id: transactionUpdate.transaction_id,
                error_message: 'No fields provided to update'
              });
              continue;
            }

            batchUpdateData.push(updateData);

          } catch (transactionError) {
            errors.push({
              transaction_id: transactionUpdate.transaction_id,
              error_message: transactionError instanceof Error ? transactionError.message : String(transactionError)
            });
          }
        }

        // Execute the batch update if there are transactions to update
        if (batchUpdateData.length > 0) {
          try {
            const response: YnabTransactionsResponse = await this.client.updateTransactions(
              input.budget_id,
              batchUpdateData
            );

            if (response.transactions) {
              allUpdatedTransactions.push(...response.transactions);
            }

            allCreatedPayees.push(...batchCreatedPayees);
            finalServerKnowledge = response.server_knowledge;

            // Handle duplicate import IDs if configured
            if (input.handle_duplicate_import_ids && response.transactions) {
              const duplicateImportIds = new Set();
              response.transactions.forEach(tx => {
                if (tx.import_id && duplicateImportIds.has(tx.import_id)) {
                  duplicateImportIdsSkipped++;
                } else if (tx.import_id) {
                  duplicateImportIds.add(tx.import_id);
                }
              });
            }

          } catch (batchError) {
            // If batch fails, add errors for all transactions in the batch
            batchUpdateData.forEach(updateData => {
              errors.push({
                transaction_id: updateData.id,
                error_message: `Batch update failed: ${batchError instanceof Error ? batchError.message : String(batchError)}`
              });
            });
          }
        }
      }

      // Format the response
      const formattedTransactions = allUpdatedTransactions.map(transaction => {
        const isTransfer = !transaction.category_id && !!transaction.transfer_account_id;

        return {
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
        };
      });

      return {
        updated_transactions: formattedTransactions,
        created_payees: allCreatedPayees,
        batch_results: {
          total_requested: input.transactions.length,
          total_updated: allUpdatedTransactions.length,
          total_batches: batches.length,
          duplicate_import_ids_skipped: duplicateImportIdsSkipped,
        },
        server_knowledge: finalServerKnowledge,
        errors: errors,
      };

    } catch (error) {
      this.handleError(error, 'batch update transactions');
    }
  }
}