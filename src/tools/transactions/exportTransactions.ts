import { z } from 'zod';
import { writeFileSync } from 'fs';
import { YnabTool } from '../base.js';
import type { YnabTransactionsResponse } from '../../types/index.js';

const ExportTransactionsInputSchema = z.object({
  budget_id: z.string().describe('The ID of the budget to export transactions from'),
  account_id: z.string().optional().describe('Filter to a specific account'),
  since_date: z.string().optional().describe('Only return transactions on or after this date (YYYY-MM-DD)'),
  output_path: z.string().optional().describe('If provided, write CSV to this file path and return a summary instead of the full CSV. Useful for large accounts.'),
});

type ExportTransactionsInput = z.infer<typeof ExportTransactionsInputSchema>;

/**
 * Escape a value for CSV output.
 * Wraps in quotes if it contains commas, quotes, or newlines.
 */
function csvEscape(value: string | null | undefined): string {
  if (value == null) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

const CSV_HEADERS = [
  'date', 'amount', 'payee_name', 'category', 'cleared', 'approved',
  'id', 'memo', 'flag_color', 'transfer_account_id', 'import_id',
];

/**
 * Export all transactions for a budget or account as a compact CSV.
 *
 * Returns a flat CSV string with one row per transaction, amounts in dollars
 * (not milliunits), suitable for direct comparison with bank statement CSVs.
 * No artificial row limit — returns everything the YNAB API provides.
 *
 * If output_path is provided, writes the CSV to disk and returns a summary
 * object instead of the full CSV string (useful for very large accounts).
 */
export class ExportTransactionsTool extends YnabTool {
  name = 'ynab_export_transactions_csv';
  description = 'Export all transactions for a budget or account as a compact CSV string. Returns flat rows with amounts in dollars — much smaller than the JSON format. Optionally writes to a file. No row limit.';
  inputSchema = ExportTransactionsInputSchema;

  async execute(args: unknown): Promise<string | {
    path: string;
    count: number;
    date_range: { from: string; to: string };
    sum: string;
  }> {
    const input = this.validateArgs<ExportTransactionsInput>(args);

    try {
      const requestOptions = {
        ...(input.since_date && { sinceDate: input.since_date }),
      };

      let response: YnabTransactionsResponse;
      if (input.account_id) {
        response = await this.client.getAccountTransactions(
          input.budget_id,
          input.account_id,
          requestOptions,
        );
      } else {
        response = await this.client.getTransactions(
          input.budget_id,
          requestOptions,
        );
      }

      const transactions = response.transactions;

      // Sort by date ascending
      transactions.sort((a, b) => a.date.localeCompare(b.date));

      // Build CSV rows
      const rows: string[] = [CSV_HEADERS.join(',')];
      let sum = 0;

      for (const t of transactions) {
        const amount = t.amount / 1000;
        sum += amount;

        rows.push([
          t.date,
          amount.toFixed(2),
          csvEscape(t.payee_name),
          csvEscape(t.category_name),
          t.cleared,
          String(t.approved),
          t.id,
          csvEscape(t.memo),
          t.flag_color || '',
          t.transfer_account_id || '',
          t.import_id || '',
        ].join(','));
      }

      const csv = rows.join('\n');

      // If output_path provided, write to file and return summary
      if (input.output_path) {
        writeFileSync(input.output_path, csv, 'utf-8');

        const dates = transactions.map(t => t.date);
        return {
          path: input.output_path,
          count: transactions.length,
          date_range: {
            from: dates[0] || '',
            to: dates[dates.length - 1] || '',
          },
          sum: sum.toFixed(2),
        };
      }

      // Otherwise return the CSV string directly
      return csv;

    } catch (error) {
      this.handleError(error, 'export transactions');
    }
  }
}
