import { z } from 'zod';
import { YnabTool } from '../base.js';
import type { YnabTransactionResponse } from '../../types/index.js';

/**
 * Input schema for the create transfer tool
 */
const CreateTransferInputSchema = z.object({
  budget_id: z.string().describe('The ID of the budget containing the accounts'),
  from_account_id: z.string().describe('The ID of the account to transfer money from'),
  to_account_id: z.string().describe('The ID of the account to transfer money to'),
  amount: z.number().describe('The amount to transfer in milliunits (positive value, 1000 = $1.00)'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('The date of the transfer in YYYY-MM-DD format'),
  memo: z.string().optional().describe('Optional memo for the transfer'),
});

type CreateTransferInput = z.infer<typeof CreateTransferInputSchema>;

/**
 * Tool for creating a transfer between two accounts
 *
 * This tool creates linked transactions between accounts by:
 * - Creating an outflow transaction in the source account
 * - Using the transfer_payee_id from the destination account
 * - YNAB automatically creates the matching inflow transaction
 * - Both transactions are linked as a transfer pair
 *
 * NOTE: This always creates NEW transactions. It does not link existing transactions.
 * If a matching transaction already exists in the destination account, this will create a duplicate.
 */
export class CreateTransferTool extends YnabTool {
  name = 'ynab_create_transfer';
  description = 'Create a new transfer between two accounts. Creates both outflow and inflow transactions automatically linked together. Amount should be positive milliunits (1000 = $1.00). WARNING: Always creates new transactions - does not link to existing ones.';
  inputSchema = CreateTransferInputSchema;

  /**
   * Execute the create transfer tool
   *
   * @param args Input arguments including account IDs, amount, date, and optional memo
   * @returns Created transfer transaction information
   */
  async execute(args: unknown): Promise<{
    transfer_transaction: {
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
      transfer: {
        account_id: string;
        transaction_id: string | null;
      };
      cleared: string;
      approved: boolean;
    };
    server_knowledge: number;
  }> {
    const input = this.validateArgs<CreateTransferInput>(args);

    try {
      // Validate amount is positive
      if (input.amount <= 0) {
        throw new Error('Transfer amount must be positive');
      }

      // Validate accounts are different
      if (input.from_account_id === input.to_account_id) {
        throw new Error('Cannot transfer between the same account');
      }

      // Get account information to find the transfer payee ID for the destination account
      const accountsResponse = await this.client.getAccounts(input.budget_id);
      const toAccount = accountsResponse.accounts.find(acc => acc.id === input.to_account_id);
      const fromAccount = accountsResponse.accounts.find(acc => acc.id === input.from_account_id);

      if (!toAccount) {
        throw new Error(`Destination account with ID ${input.to_account_id} not found`);
      }

      if (!fromAccount) {
        throw new Error(`Source account with ID ${input.from_account_id} not found`);
      }

      if (!toAccount.transfer_payee_id) {
        throw new Error(`Destination account "${toAccount.name}" does not have a transfer payee ID. This may indicate the account cannot receive transfers.`);
      }

      // Create the outflow transaction in the source account
      // YNAB will automatically create the matching inflow in the destination account
      const transactionResponse: YnabTransactionResponse = await this.client.createTransaction(
        input.budget_id,
        {
          account_id: input.from_account_id,
          payee_id: toAccount.transfer_payee_id,
          category_id: null, // Transfers don't have categories
          memo: input.memo || null,
          amount: -Math.abs(input.amount), // Negative for outflow
          date: input.date,
          cleared: 'uncleared',
          approved: false,
          flag_color: null,
          import_id: null,
        }
      );

      const transaction = transactionResponse.transaction;

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
        account: {
          id: transaction.account_id,
          name: transaction.account_name,
        },
        transfer: {
          account_id: transaction.transfer_account_id || input.to_account_id,
          transaction_id: transaction.transfer_transaction_id,
        },
        cleared: transaction.cleared,
        approved: transaction.approved,
      };

      return {
        transfer_transaction: processedTransaction,
        server_knowledge: transactionResponse.server_knowledge,
      };

    } catch (error) {
      this.handleError(error, 'create transfer');
    }
  }
}
