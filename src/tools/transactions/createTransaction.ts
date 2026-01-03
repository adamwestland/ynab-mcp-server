import { z } from 'zod';
import { YnabTool } from '../base.js';
import type { YnabTransactionsResponse, YnabPayeesResponse } from '../../types/index.js';

/**
 * Input schema for the create transaction tool
 */
const CreateTransactionInputSchema = z.object({
  budget_id: z.string().describe('The ID of the budget to create the transaction in'),
  account_id: z.string().describe('The account ID where the transaction will be created'),
  category_id: z.string().nullable().optional().describe('The category ID for the transaction. Use null for transfers or income'),
  payee_id: z.string().nullable().optional().describe('The payee ID for the transaction'),
  payee_name: z.string().optional().describe('The payee name - will create payee if not exists. Takes precedence over payee_id'),
  amount: z.number().int().describe('Transaction amount in milliunits (multiply dollars by 1000). Negative for outflows, positive for inflows'),
  memo: z.string().optional().describe('Optional memo/description for the transaction'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Transaction date in YYYY-MM-DD format'),
  cleared: z.enum(['cleared', 'uncleared', 'reconciled']).optional().default('uncleared').describe('Cleared status of the transaction'),
  approved: z.boolean().optional().default(true).describe('Whether the transaction is approved'),
  flag_color: z.enum(['red', 'orange', 'yellow', 'green', 'blue', 'purple']).nullable().optional().describe('Flag color for the transaction'),
  import_id: z.string().optional().describe('Optional import ID for deduplication. Must be unique within the budget'),
});

type CreateTransactionInput = z.infer<typeof CreateTransactionInputSchema>;

/**
 * Tool for creating a new transaction in YNAB
 * 
 * This tool allows creating transactions with:
 * - Automatic payee creation if payee_name is provided
 * - Proper amount validation in milliunits
 * - Import ID support for deduplication
 * - All standard transaction fields (cleared, approved, flag_color, etc.)
 * - Transfer support (null category_id)
 */
export class CreateTransactionTool extends YnabTool {
  name = 'ynab_create_transaction';
  description = 'Create a new transaction in YNAB. Supports payee creation, import IDs for deduplication, and all transaction fields including transfers. Amounts must be in milliunits (multiply dollars by 1000).';
  inputSchema = CreateTransactionInputSchema;

  /**
   * Execute the create transaction tool
   * 
   * @param args Input arguments for creating the transaction
   * @returns Created transaction details with confirmation
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
  }> {
    const input = this.validateArgs<CreateTransactionInput>(args);

    try {
      let payeeId = input.payee_id;
      let createdPayee = null;

      // Create payee if payee_name is provided and payee_id is not
      if (input.payee_name && !input.payee_id) {
        try {
          // First check if payee already exists
          const payeesResponse: YnabPayeesResponse = await this.client.getPayees(input.budget_id);
          const existingPayee = payeesResponse.payees.find(
            payee => payee.name.toLowerCase() === input.payee_name!.toLowerCase()
          );

          if (existingPayee) {
            payeeId = existingPayee.id;
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
          }
        } catch (payeeError) {
          // If payee creation fails, continue without payee
          console.warn('Failed to create payee, continuing without payee:', payeeError);
        }
      }

      // Validate import_id format if provided
      if (input.import_id) {
        // YNAB import IDs should be unique strings, often in YNAB:amount:payee:date format
        if (input.import_id.length > 36) {
          throw new Error('Import ID must be 36 characters or less');
        }
      }

      // Prepare transaction data
      const transactionData = {
        account_id: input.account_id,
        category_id: input.category_id || null,
        payee_id: payeeId || null,
        amount: input.amount,
        memo: input.memo || null,
        date: input.date,
        cleared: input.cleared,
        approved: input.approved,
        flag_color: input.flag_color || null,
        import_id: input.import_id || null,
      };

      // Create the transaction
      const response: YnabTransactionsResponse = await this.client.createTransactions(
        input.budget_id,
        [transactionData]
      );

      if (!response.transactions || response.transactions.length === 0) {
        throw new Error('No transaction returned from YNAB API');
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
      };

    } catch (error) {
      this.handleError(error, 'create transaction');
    }
  }
}