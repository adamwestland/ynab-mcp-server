import { z } from 'zod';
import { YnabTool } from '../base.js';
import { assertPayeeNameAllowed } from '../common/reservedPayees.js';
import type { YnabTransactionsResponse } from '../../types/index.js';

/**
 * Schema for individual transaction import
 */
const TransactionImportSchema = z.object({
  account_id: z.string().describe('The ID of the account for this transaction'),
  payee_name: z.string().optional().describe('The name of the payee (will be auto-matched or created)'),
  category_id: z.string().optional().describe('The ID of the category (optional, can be null for uncategorized)'),
  memo: z.string().optional().describe('Transaction memo (optional)'),
  amount: z.number().describe('Transaction amount in milliunits (1000 = $1.00, negative for outflows)'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Transaction date in YYYY-MM-DD format'),
  cleared: z.enum(['cleared', 'uncleared', 'reconciled']).optional().default('uncleared').describe('Cleared status. Note: "reconciled" requires approved=true; the tool auto-approves reconciled imports.'),
  approved: z.boolean().optional().describe('Whether the transaction is approved. Defaults to false (YNAB import convention), but automatically set to true when cleared="reconciled" since YNAB silently downgrades unapproved+reconciled to cleared.'),
  import_id: z.string().max(36, 'Import ID must be 36 characters or less (YNAB API limit)').describe('Unique import ID to prevent duplicates - must be unique across all imports for this budget. Max 36 characters (YNAB API limit).'),
  flag_color: z.enum(['red', 'orange', 'yellow', 'green', 'blue', 'purple']).optional().describe('Flag color (optional)'),
});

/**
 * Input schema for the import transactions tool
 */
const ImportTransactionsInputSchema = z.object({
  budget_id: z.string().describe('The ID of the budget to import transactions into'),
  transactions: z.array(TransactionImportSchema).min(1).max(100).describe('Array of transactions to import (max 100 per batch)'),
});

type ImportTransactionsInput = z.infer<typeof ImportTransactionsInputSchema>;
type TransactionImport = z.infer<typeof TransactionImportSchema>;

/**
 * Tool for importing multiple transactions with deduplication
 * 
 * This tool handles batch import of transactions with:
 * - Automatic deduplication using import_id
 * - Payee auto-matching and creation
 * - Category validation
 * - Support for up to 100 transactions per batch
 * - Comprehensive error handling and reporting
 */
export class ImportTransactionsTool extends YnabTool {
  name = 'ynab_import_transactions';
  description = 'Import multiple transactions with automatic deduplication. Each transaction must have a unique import_id. Supports batch import up to 100 transactions. Returns duplicate_import_ids for transactions that were not imported, and cleared_mismatches listing any transactions whose cleared status YNAB changed (e.g. reconciled downgraded to cleared). Reconciled imports are auto-approved since YNAB silently downgrades cleared=reconciled on unapproved transactions.';
  inputSchema = ImportTransactionsInputSchema;

  /**
   * Execute the import transactions tool
   * 
   * @param args Input arguments including budget_id and transactions array
   * @returns Imported transactions with deduplication information
   */
  async execute(args: unknown): Promise<{
    transactions: Array<{
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
      import_info: {
        id: string;
        payee_name: string | null;
        payee_name_original: string | null;
      };
    }>;
    duplicate_import_ids: string[];
    cleared_mismatches: Array<{
      import_id: string;
      requested: string;
      actual: string;
    }>;
    server_knowledge: number;
    import_summary: {
      total_submitted: number;
      successfully_imported: number;
      duplicates_found: number;
    };
  }> {
    const input = this.validateArgs<ImportTransactionsInput>(args);

    try {
      // Reject reserved YNAB payee names early with a clear error (issue #11)
      for (const tx of input.transactions) {
        assertPayeeNameAllowed(tx.payee_name);
      }

      // Validate unique import_ids within the batch
      const importIds = input.transactions.map(tx => tx.import_id);
      const uniqueImportIds = new Set(importIds);
      
      if (importIds.length !== uniqueImportIds.size) {
        const duplicateIds = importIds.filter((id, index) => importIds.indexOf(id) !== index);
        throw new Error(`Duplicate import_ids found within the batch: ${Array.from(new Set(duplicateIds)).join(', ')}`);
      }

      // Prepare transactions for import
      // YNAB silently downgrades cleared=reconciled unless approved=true, so
      // reconciled imports are auto-approved when approved is not specified.
      const transactionsToImport = input.transactions.map((tx: TransactionImport) => ({
        account_id: tx.account_id,
        payee_name: tx.payee_name || null,
        category_id: tx.category_id || null,
        memo: tx.memo || null,
        amount: tx.amount,
        date: tx.date,
        cleared: tx.cleared,
        approved: tx.approved ?? (tx.cleared === 'reconciled'),
        flag_color: tx.flag_color || null,
        import_id: tx.import_id,
      }));

      // Import the transactions
      const importResponse: YnabTransactionsResponse = await this.client.createTransactions(
        input.budget_id,
        transactionsToImport
      );

      // Process and format imported transaction data
      const processedTransactions = importResponse.transactions.map(transaction => ({
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
        import_info: {
          id: transaction.import_id!,
          payee_name: transaction.import_payee_name,
          payee_name_original: transaction.import_payee_name_original,
        },
      }));

      // Calculate duplicate import IDs
      const importedIds = processedTransactions.map(tx => tx.import_info.id);
      const duplicateImportIds = importIds.filter(id => !importedIds.includes(id));

      // Detect when YNAB returned a different cleared status than requested
      // (most commonly "reconciled" requests downgraded to "cleared" or
      // "uncleared" — see issue #10)
      const requestedClearedByImportId = new Map(
        input.transactions.map(tx => [tx.import_id, tx.cleared])
      );
      const clearedMismatches: Array<{ import_id: string; requested: string; actual: string }> = [];
      for (const tx of processedTransactions) {
        const requested = requestedClearedByImportId.get(tx.import_info.id);
        if (requested && requested !== tx.cleared) {
          clearedMismatches.push({
            import_id: tx.import_info.id,
            requested,
            actual: tx.cleared,
          });
        }
      }

      // Create import summary
      const importSummary = {
        total_submitted: input.transactions.length,
        successfully_imported: processedTransactions.length,
        duplicates_found: duplicateImportIds.length,
      };

      return {
        transactions: processedTransactions,
        duplicate_import_ids: duplicateImportIds,
        cleared_mismatches: clearedMismatches,
        server_knowledge: importResponse.server_knowledge,
        import_summary: importSummary,
      };

    } catch (error) {
      // Handle specific YNAB API errors
      if (error instanceof Error) {
        if (error.message.includes('import_id') && error.message.includes('already exists')) {
          throw new Error(`One or more import_ids already exist in the budget. Check the duplicate_import_ids in the response. Original error: ${error.message}`);
        }
        
        if (error.message.includes('account_id')) {
          throw new Error(`Invalid account_id in one or more transactions. Please verify all account IDs exist in the budget. Original error: ${error.message}`);
        }

        if (error.message.includes('category_id')) {
          throw new Error(`Invalid category_id in one or more transactions. Please verify all category IDs exist in the budget. Original error: ${error.message}`);
        }
      }
      
      this.handleError(error, 'import transactions');
    }
  }
}