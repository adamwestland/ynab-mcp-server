import { z } from 'zod';
import { YnabTool } from '../base.js';

const FindTransferCounterpartInputSchema = z.object({
  budget_id: z.string().describe('The ID of the budget'),
  account_id: z.string().describe('The account the source transaction is in'),
  amount: z.number().describe('Transaction amount in milliunits. Searches for the negated amount in other accounts (e.g., -250000 finds +250000)'),
  date: z.string().describe('Transaction date (YYYY-MM-DD) — center of the search window'),
  date_window: z.number().optional().default(5).describe('Days before/after the date to search (default: 5)'),
  exclude_account_ids: z.array(z.string()).optional().describe('Additional account IDs to exclude from search'),
});

type FindTransferCounterpartInput = z.infer<typeof FindTransferCounterpartInputSchema>;

/**
 * Given a transaction's amount and date in one account, search all other
 * accounts for the opposite amount within a date window. Returns candidates
 * ranked by date proximity — useful during reconciliation to determine if
 * a bank-only transaction is actually a transfer to another YNAB account.
 */
export class FindTransferCounterpartTool extends YnabTool {
  name = 'ynab_find_transfer_counterpart';
  description = 'Search other accounts for the opposite side of a potential transfer. Given an amount and date from one account, finds transactions with the negated amount in all other accounts within a date window. Returns candidates ranked by date proximity.';
  inputSchema = FindTransferCounterpartInputSchema;

  async execute(args: unknown) {
    const input = this.validateArgs<FindTransferCounterpartInput>(args);

    try {
      const targetAmount = -input.amount;

      // Compute date window
      const centerDate = new Date(input.date + 'T00:00:00');
      const sinceDate = new Date(centerDate);
      sinceDate.setDate(sinceDate.getDate() - input.date_window);
      const untilDate = new Date(centerDate);
      untilDate.setDate(untilDate.getDate() + input.date_window);

      const sinceDateStr = sinceDate.toISOString().slice(0, 10);
      const untilDateStr = untilDate.toISOString().slice(0, 10);

      // Fetch all transactions in the date range across all accounts
      const response = await this.client.getTransactions(input.budget_id, {
        sinceDate: sinceDateStr,
      });

      const excludeIds = new Set([
        input.account_id,
        ...(input.exclude_account_ids || []),
      ]);

      // Filter: matching amount, within date window, different account
      const candidates = response.transactions
        .filter(t => {
          if (excludeIds.has(t.account_id)) return false;
          if (t.amount !== targetAmount) return false;
          if (t.date > untilDateStr) return false;
          return true;
        })
        .map(t => {
          const txDate = new Date(t.date + 'T00:00:00');
          const daysDiff = Math.round(
            Math.abs(txDate.getTime() - centerDate.getTime()) / (1000 * 60 * 60 * 24)
          );
          return {
            id: t.id,
            date: t.date,
            amount_milliunits: t.amount,
            amount_dollars: (t.amount / 1000).toFixed(2),
            account_id: t.account_id,
            account_name: t.account_name,
            payee_name: t.payee_name,
            memo: t.memo,
            cleared: t.cleared,
            transfer_account_id: t.transfer_account_id || null,
            days_from_source: daysDiff,
          };
        })
        .sort((a, b) => a.days_from_source - b.days_from_source);

      return {
        source: {
          account_id: input.account_id,
          amount_milliunits: input.amount,
          amount_dollars: (input.amount / 1000).toFixed(2),
          date: input.date,
        },
        search: {
          target_amount_milliunits: targetAmount,
          target_amount_dollars: (targetAmount / 1000).toFixed(2),
          date_range: `${sinceDateStr} to ${untilDateStr}`,
          window_days: input.date_window,
        },
        candidates,
        count: candidates.length,
      };
    } catch (error) {
      this.handleError(error, 'find transfers');
    }
  }
}
