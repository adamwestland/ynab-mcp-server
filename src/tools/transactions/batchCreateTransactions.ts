import { z } from 'zod';
import { YnabTool } from '../base.js';
import { assertPayeeNameAllowed } from '../common/reservedPayees.js';
import { YNABError } from '../../client/ErrorHandler.js';
import type { SaveTransaction, YnabTransaction, YnabTransactionsResponse } from '../../types/index.js';

const BatchCreateTransactionInputSchema = z.object({
  account_id: z.string().describe('The account ID where the transaction will be created'),
  category_id: z.string().nullable().optional().describe('The category ID for the transaction. Use null for transfers or income'),
  payee_id: z.string().nullable().optional().describe('The payee ID for the transaction'),
  payee_name: z.string().optional().describe('The payee name. Tool does NOT auto-create payees in batch mode; set payee_id or an exact existing name'),
  amount: z.number().int().describe('Transaction amount in milliunits. Negative for outflows, positive for inflows'),
  memo: z.string().optional().describe('Optional memo/description for the transaction'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Transaction date in YYYY-MM-DD format'),
  cleared: z.enum(['cleared', 'uncleared', 'reconciled']).optional().default('uncleared').describe('Cleared status. This tool defaults approved=true so reconciled is preserved without special handling'),
  approved: z.boolean().optional().default(true).describe('Whether the transaction is approved. Default true'),
  flag_color: z.enum(['red', 'orange', 'yellow', 'green', 'blue', 'purple']).nullable().optional().describe('Flag color for the transaction'),
  import_id: z.string().max(36, 'Import ID must be 36 characters or less (YNAB API limit)').optional().describe('Optional deduplication key. Max 36 characters. Supplying one also lets the response correlate created rows back to submission order'),
});

type BatchCreateTransactionInput = z.infer<typeof BatchCreateTransactionInputSchema>;

const BatchCreateInputSchema = z.object({
  budget_id: z.string().describe('The ID of the budget to create the transactions in'),
  transactions: z.array(BatchCreateTransactionInputSchema).min(1).max(100).describe('Array of transactions to create (max 100 per batch)'),
});

type BatchCreateInput = z.infer<typeof BatchCreateInputSchema>;

interface CreatedTransactionSummary {
  id: string;
  /** Submission index, or null when bulk mode can't correlate (no import_id). */
  index: number | null;
  date: string;
  amount: { milliunits: number; formatted: string };
  account_id: string;
  category_id: string | null;
  cleared: string;
  approved: boolean;
  import_id: string | null;
}

interface FailedTransaction {
  index: number;
  error: string;
  input_summary: { account_id: string; amount: number; date: string };
}

export interface BatchCreateResult {
  created: CreatedTransactionSummary[];
  failed: FailedTransaction[];
  duplicate_import_ids: string[];
  /** null when no successful API call was made — avoids delta-sync callers confusing 0 with "no prior knowledge". */
  server_knowledge: number | null;
  summary: {
    total_submitted: number;
    created: number;
    failed: number;
    duplicates: number;
    used_fallback: boolean;
  };
}

function toSaveTransaction(input: BatchCreateTransactionInput): SaveTransaction {
  return {
    account_id: input.account_id,
    category_id: input.category_id ?? null,
    payee_id: input.payee_id ?? null,
    payee_name: input.payee_name ?? null,
    amount: input.amount,
    memo: input.memo ?? null,
    date: input.date,
    cleared: input.cleared,
    approved: input.approved,
    flag_color: input.flag_color ?? null,
    import_id: input.import_id ?? null,
  };
}

function formatCurrency(milliunits: number): string {
  const dollars = milliunits / 1000;
  return dollars < 0 ? `-$${Math.abs(dollars).toFixed(2)}` : `$${dollars.toFixed(2)}`;
}

function summarize(tx: YnabTransaction, index: number | null): CreatedTransactionSummary {
  return {
    id: tx.id,
    index,
    date: tx.date,
    amount: { milliunits: tx.amount, formatted: formatCurrency(tx.amount) },
    account_id: tx.account_id,
    category_id: tx.category_id,
    cleared: tx.cleared,
    approved: tx.approved,
    import_id: tx.import_id,
  };
}

// Only 400/409 hint at a specific row being at fault; anything else is system-level and per-row fallback would amplify the damage.
function shouldFallbackOn(err: unknown): boolean {
  if (!(err instanceof YNABError)) return false;
  return err.statusCode === 400 || err.statusCode === 409;
}

export class BatchCreateTransactionsTool extends YnabTool {
  name = 'ynab_batch_create_transactions';
  description = 'Create up to 100 transactions in a single batch. Tries one bulk POST; on a YNAB 400/409 (which by design aborts the whole batch and hides which row was at fault), automatically falls back to per-transaction POSTs and reports which rows succeeded and which failed. Preserves cleared=reconciled with approved=true defaults. Amounts in milliunits.';
  inputSchema = BatchCreateInputSchema;

  async execute(args: unknown): Promise<BatchCreateResult> {
    const input = this.validateArgs<BatchCreateInput>(args);
    for (const tx of input.transactions) {
      assertPayeeNameAllowed(tx.payee_name);
    }

    try {
      try {
        return await this.bulkCreate(input);
      } catch (bulkError) {
        if (!shouldFallbackOn(bulkError) || input.transactions.length <= 1) {
          throw bulkError;
        }
        return await this.fallbackPerTransaction(input);
      }
    } catch (error) {
      this.handleError(error, 'batch create transactions');
    }
  }

  private async bulkCreate(input: BatchCreateInput): Promise<BatchCreateResult> {
    const payload = input.transactions.map(toSaveTransaction);
    const response: YnabTransactionsResponse = await this.client.createTransactions(input.budget_id, payload);

    // YNAB doesn't guarantee bulk response order matches submission order; correlate via import_id when supplied, index=null otherwise.
    const submissionIndexByImportId = new Map<string, number>();
    input.transactions.forEach((t, i) => {
      if (t.import_id) submissionIndexByImportId.set(t.import_id, i);
    });
    const created = response.transactions.map(tx => {
      const index = tx.import_id ? submissionIndexByImportId.get(tx.import_id) ?? null : null;
      return summarize(tx, index);
    });

    const returnedImportIds = new Set(response.transactions.map(t => t.import_id).filter((v): v is string => !!v));
    const submittedImportIds = input.transactions.map(t => t.import_id).filter((v): v is string => !!v);
    const duplicateImportIds = submittedImportIds.filter(id => !returnedImportIds.has(id));

    return {
      created,
      failed: [],
      duplicate_import_ids: duplicateImportIds,
      server_knowledge: response.server_knowledge,
      summary: {
        total_submitted: input.transactions.length,
        created: created.length,
        failed: 0,
        duplicates: duplicateImportIds.length,
        used_fallback: false,
      },
    };
  }

  private async fallbackPerTransaction(input: BatchCreateInput): Promise<BatchCreateResult> {
    const created: CreatedTransactionSummary[] = [];
    const failed: FailedTransaction[] = [];
    const duplicateImportIds: string[] = [];
    let serverKnowledge: number | null = null;

    for (let index = 0; index < input.transactions.length; index += 1) {
      const row = input.transactions[index]!;
      try {
        const resp = await this.client.createTransactions(input.budget_id, [toSaveTransaction(row)]);
        if (!resp.transactions || resp.transactions.length === 0) {
          if (row.import_id) duplicateImportIds.push(row.import_id);
          else {
            failed.push({
              index,
              error: 'YNAB returned no transaction (possible silent rejection)',
              input_summary: { account_id: row.account_id, amount: row.amount, date: row.date },
            });
          }
          continue;
        }
        created.push(summarize(resp.transactions[0]!, index));
        serverKnowledge = resp.server_knowledge;
      } catch (error) {
        // Re-raise non-4xx (rate-limit, 5xx, network) so we stop hammering a degraded server.
        if (!shouldFallbackOn(error)) throw error;
        const message = error instanceof Error ? error.message : String(error);
        failed.push({
          index,
          error: message,
          input_summary: { account_id: row.account_id, amount: row.amount, date: row.date },
        });
      }
    }

    return {
      created,
      failed,
      duplicate_import_ids: duplicateImportIds,
      server_knowledge: serverKnowledge,
      summary: {
        total_submitted: input.transactions.length,
        created: created.length,
        failed: failed.length,
        duplicates: duplicateImportIds.length,
        used_fallback: true,
      },
    };
  }
}
