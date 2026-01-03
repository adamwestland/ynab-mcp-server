import { z } from 'zod';
import { YnabTool } from '../base.js';
import type { YnabTransactionsResponse, YnabPayeesResponse, SaveTransaction } from '../../types/index.js';

/**
 * Schema for individual subtransaction in split
 */
const SubtransactionSchema = z.object({
  category_id: z.string().nullable().optional().describe('Category ID for this subtransaction. Use null for transfers'),
  payee_id: z.string().nullable().optional().describe('Payee ID for this subtransaction'),
  payee_name: z.string().optional().describe('Payee name - will create payee if not exists. Takes precedence over payee_id'),
  amount: z.number().int().describe('Subtransaction amount in milliunits. Must be negative for outflows, positive for inflows'),
  memo: z.string().optional().describe('Optional memo for this subtransaction'),
});

/**
 * Input schema for the create split transaction tool
 */
const CreateSplitTransactionInputSchema = z.object({
  budget_id: z.string().describe('The ID of the budget to create the transaction in'),
  account_id: z.string().describe('The account ID where the transaction will be created'),
  payee_id: z.string().nullable().optional().describe('The main payee ID for the transaction'),
  payee_name: z.string().optional().describe('The main payee name - will create payee if not exists. Takes precedence over payee_id'),
  amount: z.number().int().describe('Total transaction amount in milliunits. Must equal sum of all subtransactions'),
  memo: z.string().optional().describe('Optional memo/description for the main transaction'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Transaction date in YYYY-MM-DD format'),
  cleared: z.enum(['cleared', 'uncleared', 'reconciled']).optional().default('uncleared').describe('Cleared status of the transaction'),
  approved: z.boolean().optional().default(true).describe('Whether the transaction is approved'),
  flag_color: z.enum(['red', 'orange', 'yellow', 'green', 'blue', 'purple']).nullable().optional().describe('Flag color for the transaction'),
  import_id: z.string().optional().describe('Optional import ID for deduplication. Must be unique within the budget'),
  subtransactions: z.array(SubtransactionSchema)
    .min(2)
    .max(200)
    .describe('Array of subtransactions. Minimum 2, maximum 200. Amounts must sum to total transaction amount'),
});

type CreateSplitTransactionInput = z.infer<typeof CreateSplitTransactionInputSchema>;

/**
 * Tool for creating a split transaction in YNAB
 * 
 * This tool creates transactions with multiple category splits:
 * - Validates subtransactions sum to parent amount
 * - Minimum 2 subtransactions required
 * - Each subtransaction can have its own category/payee
 * - Supports payee creation for main transaction and subtransactions
 * - Handles all standard transaction fields
 */
export class CreateSplitTransactionTool extends YnabTool {
  name = 'ynab_create_split_transaction';
  description = 'Create a split transaction in YNAB with multiple category allocations. Requires minimum 2 subtransactions that sum to the total amount. Supports individual payees per subtransaction.';
  inputSchema = CreateSplitTransactionInputSchema;

  /**
   * Execute the create split transaction tool
   * 
   * @param args Input arguments for creating the split transaction
   * @returns Created split transaction with all subtransactions
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
      account: {
        id: string;
        name: string;
      };
      cleared: string;
      approved: boolean;
      flag: {
        color: string | null;
        name: string | null;
      } | null;
      import_id: string | null;
      is_split: true;
      subtransactions: Array<{
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
      used_for: string; // 'main_transaction' or 'subtransaction_N'
    }>;
    server_knowledge: number;
    validation_results: {
      subtransactions_sum: number;
      total_amount: number;
      amounts_match: boolean;
    };
  }> {
    const input = this.validateArgs<CreateSplitTransactionInput>(args);

    try {
      // Validate that subtransactions sum to total amount
      const subtransactionsSum = input.subtransactions.reduce((sum, sub) => sum + sub.amount, 0);
      const amountsMatch = subtransactionsSum === input.amount;

      if (!amountsMatch) {
        throw new Error(
          `Subtransactions sum (${this.formatCurrency(subtransactionsSum)}) does not equal total amount (${this.formatCurrency(input.amount)}). ` +
          `Difference: ${this.formatCurrency(Math.abs(subtransactionsSum - input.amount))}`
        );
      }

      // Get existing payees for payee name resolution
      let existingPayees: { id: string; name: string }[] = [];
      try {
        const payeesResponse: YnabPayeesResponse = await this.client.getPayees(input.budget_id);
        existingPayees = payeesResponse.payees;
      } catch (payeeError) {
        console.warn('Failed to fetch existing payees:', payeeError);
      }

      const createdPayees: { id: string; name: string; used_for: string }[] = [];

      // Handle main transaction payee
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
            existingPayees.push(newPayeeResponse.payee); // Add to existing for subtransaction use
          } catch (payeeError) {
            console.warn('Failed to create main payee, continuing without payee:', payeeError);
          }
        }
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
            // Check if we already created this payee
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

        processedSubtransactions.push({
          amount: sub.amount,
          category_id: sub.category_id || null,
          payee_id: subPayeeId || null,
          memo: sub.memo || null,
        });
      }

      // Validate import_id format if provided
      if (input.import_id) {
        if (input.import_id.length > 36) {
          throw new Error('Import ID must be 36 characters or less');
        }
      }

      // Prepare transaction data with subtransactions
      const transactionData: SaveTransaction = {
        account_id: input.account_id,
        payee_id: mainPayeeId || null,
        amount: input.amount,
        memo: input.memo || null,
        date: input.date,
        cleared: input.cleared,
        approved: input.approved,
        flag_color: input.flag_color || null,
        import_id: input.import_id || null,
        subtransactions: processedSubtransactions,
      };

      // Create the split transaction
      const response: YnabTransactionsResponse = await this.client.createTransactions(
        input.budget_id,
        [transactionData]
      );

      if (!response.transactions || response.transactions.length === 0) {
        throw new Error('No transaction returned from YNAB API');
      }

      const transaction = response.transactions[0]!;

      if (!transaction.subtransactions || transaction.subtransactions.length === 0) {
        throw new Error('Split transaction was created but no subtransactions returned');
      }

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
          account: {
            id: transaction.account_id,
            name: transaction.account_name,
          },
          cleared: transaction.cleared,
          approved: transaction.approved,
          flag: (transaction.flag_color || transaction.flag_name) ? {
            color: transaction.flag_color,
            name: transaction.flag_name,
          } : null,
          import_id: transaction.import_id,
          is_split: true,
          subtransactions: transaction.subtransactions.map(sub => ({
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
          })),
        },
        created_payees: createdPayees,
        server_knowledge: response.server_knowledge,
        validation_results: {
          subtransactions_sum: subtransactionsSum,
          total_amount: input.amount,
          amounts_match: amountsMatch,
        },
      };

    } catch (error) {
      this.handleError(error, 'create split transaction');
    }
  }
}