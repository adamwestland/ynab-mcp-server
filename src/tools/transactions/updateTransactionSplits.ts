import { z } from 'zod';
import { YnabTool } from '../base.js';
import type { YnabTransactionsResponse, YnabPayeesResponse, UpdateTransactionWithId, UpdateSubTransaction } from '../../types/index.js';

/**
 * Schema for updating or adding a subtransaction
 */
const SubtransactionUpdateSchema = z.object({
  subtransaction_id: z.string().optional().describe('ID of existing subtransaction to update. Omit to create new subtransaction'),
  category_id: z.string().nullable().optional().describe('Category ID for this subtransaction. Use null for transfers'),
  payee_id: z.string().nullable().optional().describe('Payee ID for this subtransaction'),
  payee_name: z.string().optional().describe('Payee name - will create payee if not exists. Takes precedence over payee_id'),
  amount: z.number().int().describe('Subtransaction amount in milliunits. Must be negative for outflows, positive for inflows'),
  memo: z.string().nullable().optional().describe('Memo for this subtransaction. Use null to clear'),
});

/**
 * Input schema for the update transaction splits tool
 */
const UpdateTransactionSplitsInputSchema = z.object({
  budget_id: z.string().describe('The ID of the budget containing the transaction'),
  transaction_id: z.string().describe('The ID of the transaction to update splits for'),
  subtransactions: z.array(SubtransactionUpdateSchema)
    .min(0)
    .max(200)
    .optional()
    .describe('Array of subtransactions to update/add. Omit to convert regular transaction to split based on total_amount'),
  total_amount: z.number().int().optional().describe('New total transaction amount in milliunits. Must equal sum of all subtransactions if provided'),
  remove_subtransaction_ids: z.array(z.string()).optional().describe('Array of subtransaction IDs to remove'),
  convert_to_regular: z.boolean().optional().default(false).describe('Convert split transaction back to regular transaction. Requires category_id'),
  category_id: z.string().nullable().optional().describe('Category ID when converting to regular transaction or updating main transaction'),
  payee_id: z.string().nullable().optional().describe('Update main transaction payee ID'),
  payee_name: z.string().optional().describe('Update main transaction payee name'),
  memo: z.string().nullable().optional().describe('Update main transaction memo'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Update transaction date'),
  cleared: z.enum(['cleared', 'uncleared', 'reconciled']).optional().describe('Update cleared status'),
  approved: z.boolean().optional().describe('Update approval status'),
  flag_color: z.enum(['red', 'orange', 'yellow', 'green', 'blue', 'purple']).nullable().optional().describe('Update flag color'),
});

type UpdateTransactionSplitsInput = z.infer<typeof UpdateTransactionSplitsInputSchema>;

/**
 * Tool for updating transaction splits in YNAB
 * 
 * This tool provides comprehensive split transaction management:
 * - Convert regular transactions to split transactions
 * - Update existing split subtransactions
 * - Add/remove subtransactions
 * - Convert split transactions back to regular transactions
 * - Validate amounts sum correctly
 * - Handle payee creation for subtransactions
 */
export class UpdateTransactionSplitsTool extends YnabTool {
  name = 'ynab_update_transaction_splits';
  description = 'Update transaction splits in YNAB. Convert regular transactions to splits, modify existing splits, add/remove subtransactions, or convert splits back to regular transactions.';
  inputSchema = UpdateTransactionSplitsInputSchema;

  /**
   * Execute the update transaction splits tool
   * 
   * @param args Input arguments for updating transaction splits
   * @returns Updated transaction with split details
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
      is_split: boolean;
      subtransactions?: Array<{
        id: string;
        transaction_id: string;
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
        transfer: {
          account_id: string | null;
          transaction_id: string | null;
        } | null;
      }>;
    };
    created_payees: Array<{
      id: string;
      name: string;
      used_for: string;
    }>;
    server_knowledge: number;
    operation_summary: {
      operation_type: 'convert_to_split' | 'update_split' | 'convert_to_regular';
      subtransactions_added: number;
      subtransactions_updated: number;
      subtransactions_removed: number;
      total_amount_changed: boolean;
    };
  }> {
    const input = this.validateArgs<UpdateTransactionSplitsInput>(args);

    try {
      // First, get the current transaction to understand its current state
      const currentTransactionResponse = await this.client.getTransactions(
        input.budget_id,
        { sinceDate: '1900-01-01' }
      );
      
      const currentTransaction = currentTransactionResponse.transactions.find(
        t => t.id === input.transaction_id
      );

      if (!currentTransaction) {
        throw new Error(`Transaction with ID ${input.transaction_id} not found`);
      }

      const isCurrentlySplit = !!(currentTransaction.subtransactions && currentTransaction.subtransactions.length > 0);

      // Get existing payees for payee name resolution
      let existingPayees: { id: string; name: string }[] = [];
      try {
        const payeesResponse: YnabPayeesResponse = await this.client.getPayees(input.budget_id);
        existingPayees = payeesResponse.payees;
      } catch (payeeError) {
        console.warn('Failed to fetch existing payees:', payeeError);
      }

      const createdPayees: { id: string; name: string; used_for: string }[] = [];
      let operationType: 'convert_to_split' | 'update_split' | 'convert_to_regular';
      let subtransactionsAdded = 0;
      let subtransactionsUpdated = 0;
      let subtransactionsRemoved = 0;
      let totalAmountChanged = false;

      // Handle main transaction payee if provided
      let mainPayeeId = input.payee_id;
      if (input.payee_name && !input.payee_id) {
        const existingPayee = existingPayees.find(
          payee => payee.name.toLowerCase() === input.payee_name!.toLowerCase()
        );

        if (existingPayee) {
          mainPayeeId = existingPayee.id;
        } else {
          try {
            const newPayeeResponse = await this.client.post<{ payee: { id: string; name: string } }>(
              `/budgets/${input.budget_id}/payees`,
              {
                payee: {
                  name: input.payee_name,
                },
              }
            );
            mainPayeeId = newPayeeResponse.payee.id;
            createdPayees.push({
              id: newPayeeResponse.payee.id,
              name: newPayeeResponse.payee.name,
              used_for: 'main_transaction',
            });
            existingPayees.push(newPayeeResponse.payee);
          } catch (payeeError) {
            console.warn('Failed to create main payee:', payeeError);
          }
        }
      }

      // Determine operation type and build update data
      const updateData: UpdateTransactionWithId = {
        id: input.transaction_id,
      };

      if (input.convert_to_regular) {
        // Convert split transaction to regular transaction
        if (!isCurrentlySplit) {
          throw new Error('Transaction is not currently a split transaction');
        }
        if (!input.category_id) {
          throw new Error('category_id is required when converting to regular transaction');
        }

        operationType = 'convert_to_regular';
        updateData.category_id = input.category_id;
        updateData.subtransactions = []; // Clear all subtransactions

        if (currentTransaction.subtransactions) {
          subtransactionsRemoved = currentTransaction.subtransactions.length;
        }

      } else if (input.subtransactions && input.subtransactions.length > 0) {
        // Working with split transaction
        operationType = isCurrentlySplit ? 'update_split' : 'convert_to_split';

        // Validate subtransactions
        if (input.subtransactions.length < 2 && !isCurrentlySplit) {
          throw new Error('At least 2 subtransactions required when converting to split transaction');
        }

        // Calculate total from subtransactions
        const subtransactionsTotal = input.subtransactions.reduce((sum, sub) => sum + sub.amount, 0);
        const targetTotal = input.total_amount !== undefined ? input.total_amount : subtransactionsTotal;

        if (subtransactionsTotal !== targetTotal) {
          throw new Error(
            `Subtransactions sum (${this.formatCurrency(subtransactionsTotal)}) does not equal target total (${this.formatCurrency(targetTotal)})`
          );
        }

        if (targetTotal !== currentTransaction.amount) {
          totalAmountChanged = true;
          updateData.amount = targetTotal;
        }

        // Process subtransactions and handle payee creation
        const processedSubtransactions = [];
        for (let i = 0; i < input.subtransactions.length; i++) {
          const sub = input.subtransactions[i]!;
          let subPayeeId = sub.payee_id;

          // Handle subtransaction payee creation
          if (sub.payee_name && !sub.payee_id) {
            const existingPayee = existingPayees.find(
              payee => payee.name.toLowerCase() === sub.payee_name!.toLowerCase()
            );

            if (existingPayee) {
              subPayeeId = existingPayee.id;
            } else {
              const alreadyCreated = createdPayees.find(
                p => p.name.toLowerCase() === sub.payee_name!.toLowerCase()
              );

              if (alreadyCreated) {
                subPayeeId = alreadyCreated.id;
              } else {
                try {
                  const newPayeeResponse = await this.client.post<{ payee: { id: string; name: string } }>(
                    `/budgets/${input.budget_id}/payees`,
                    {
                      payee: {
                        name: sub.payee_name,
                      },
                    }
                  );
                  subPayeeId = newPayeeResponse.payee.id;
                  createdPayees.push({
                    id: newPayeeResponse.payee.id,
                    name: newPayeeResponse.payee.name,
                    used_for: `subtransaction_${i + 1}`,
                  });
                  existingPayees.push(newPayeeResponse.payee);
                } catch (payeeError) {
                  console.warn(`Failed to create payee for subtransaction ${i + 1}:`, payeeError);
                }
              }
            }
          }

          const processedSub: UpdateSubTransaction = {
            amount: sub.amount,
            category_id: sub.category_id || null,
            payee_id: subPayeeId || null,
            memo: sub.memo !== undefined ? sub.memo : null,
          };

          // Include ID if updating existing subtransaction
          if (sub.subtransaction_id) {
            processedSub.id = sub.subtransaction_id;
            subtransactionsUpdated++;
          } else {
            subtransactionsAdded++;
          }

          processedSubtransactions.push(processedSub);
        }

        updateData.subtransactions = processedSubtransactions;

        // Handle removal of subtransactions
        if (input.remove_subtransaction_ids && input.remove_subtransaction_ids.length > 0) {
          subtransactionsRemoved = input.remove_subtransaction_ids.length;
          // Note: YNAB API handles removal by omitting subtransactions from the array
          // The API will remove any existing subtransactions not included in the new array
        }

      } else {
        // Just updating main transaction properties
        operationType = isCurrentlySplit ? 'update_split' : 'update_split';
      }

      // Add other main transaction updates
      if (mainPayeeId !== undefined || input.payee_id !== undefined) {
        updateData.payee_id = mainPayeeId ?? input.payee_id ?? null;
      }
      if (input.memo !== undefined) updateData.memo = input.memo;
      if (input.date !== undefined) updateData.date = input.date;
      if (input.cleared !== undefined) updateData.cleared = input.cleared;
      if (input.approved !== undefined) updateData.approved = input.approved;
      if (input.flag_color !== undefined) updateData.flag_color = input.flag_color;

      // Execute the update
      const response: YnabTransactionsResponse = await this.client.updateTransactions(
        input.budget_id,
        [updateData]
      );

      if (!response.transactions || response.transactions.length === 0) {
        throw new Error('No transaction returned from YNAB API after update');
      }

      const transaction = response.transactions[0]!;
      const isSplit = !!(transaction.subtransactions && transaction.subtransactions.length > 0);

      const result: any = {
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
        is_split: isSplit,
      };

      if (isSplit && transaction.subtransactions) {
        result.subtransactions = transaction.subtransactions.map(sub => ({
          id: sub.id,
          transaction_id: sub.transaction_id,
          amount: {
            milliunits: sub.amount,
            formatted: this.formatCurrency(sub.amount),
          },
          memo: sub.memo,
          payee: {
            id: sub.payee_id,
            name: sub.payee_name,
          },
          category: {
            id: sub.category_id,
            name: sub.category_name,
          },
          transfer: sub.transfer_account_id ? {
            account_id: sub.transfer_account_id,
            transaction_id: sub.transfer_transaction_id,
          } : null,
        }));
      }

      return {
        transaction: result,
        created_payees: createdPayees,
        server_knowledge: response.server_knowledge,
        operation_summary: {
          operation_type: operationType,
          subtransactions_added: subtransactionsAdded,
          subtransactions_updated: subtransactionsUpdated,
          subtransactions_removed: subtransactionsRemoved,
          total_amount_changed: totalAmountChanged,
        },
      };

    } catch (error) {
      this.handleError(error, 'update transaction splits');
    }
  }
}