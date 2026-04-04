import { z } from 'zod';
import { YnabTool } from '../base.js';
import type { YnabAccountsResponse, YnabTransactionsResponse } from '../../types/index.js';

const GetAccountSummaryInputSchema = z.object({
  budget_id: z.string().describe('The ID of the budget to get account summary for'),
  include_closed: z.boolean().optional().default(false).describe('Include closed accounts in results'),
  on_budget_only: z.boolean().optional().describe('Only return on-budget accounts'),
});

type GetAccountSummaryInput = z.infer<typeof GetAccountSummaryInputSchema>;

export class GetAccountSummaryTool extends YnabTool {
  name = 'ynab_get_account_summary';
  description = 'Get a dashboard summary of all accounts with balances and counts of unapproved/uncategorized transactions per account. Makes 3 API calls (accounts + unapproved txns + uncategorized txns).';
  inputSchema = GetAccountSummaryInputSchema;

  async execute(args: unknown) {
    const input = this.validateArgs<GetAccountSummaryInput>(args);

    try {
      const [accountsResponse, unapprovedResponse, uncategorizedResponse] = await Promise.all([
        this.client.getAccounts(input.budget_id) as Promise<YnabAccountsResponse>,
        this.client.getTransactions(input.budget_id, { type: 'unapproved' }) as Promise<YnabTransactionsResponse>,
        this.client.getTransactions(input.budget_id, { type: 'uncategorized' }) as Promise<YnabTransactionsResponse>,
      ]);

      // Build count maps
      const unapprovedByAccount = new Map<string, number>();
      for (const tx of unapprovedResponse.transactions) {
        unapprovedByAccount.set(tx.account_id, (unapprovedByAccount.get(tx.account_id) ?? 0) + 1);
      }

      const uncategorizedByAccount = new Map<string, number>();
      for (const tx of uncategorizedResponse.transactions) {
        if (tx.transfer_account_id) continue; // on-budget transfers intentionally have no category
        uncategorizedByAccount.set(tx.account_id, (uncategorizedByAccount.get(tx.account_id) ?? 0) + 1);
      }

      // Filter accounts
      let filteredAccounts = accountsResponse.accounts;
      if (!input.include_closed) {
        filteredAccounts = filteredAccounts.filter(a => !a.closed);
      }
      if (input.on_budget_only) {
        filteredAccounts = filteredAccounts.filter(a => a.on_budget);
      }

      // Build summary per account
      const accounts = filteredAccounts.map(a => ({
        id: a.id,
        name: a.name,
        type: a.type,
        on_budget: a.on_budget,
        closed: a.closed,
        balance: { milliunits: a.balance, formatted: this.formatCurrency(a.balance) },
        cleared_balance: { milliunits: a.cleared_balance, formatted: this.formatCurrency(a.cleared_balance) },
        uncleared_balance: { milliunits: a.uncleared_balance, formatted: this.formatCurrency(a.uncleared_balance) },
        unapproved_count: unapprovedByAccount.get(a.id) ?? 0,
        uncategorized_count: uncategorizedByAccount.get(a.id) ?? 0,
      }));

      // Sort: on-budget first, then by type, then by name
      accounts.sort((a, b) => {
        if (a.on_budget && !b.on_budget) return -1;
        if (!a.on_budget && b.on_budget) return 1;
        if (a.type !== b.type) return a.type.localeCompare(b.type);
        return a.name.localeCompare(b.name);
      });

      const totalBalance = accounts.reduce((sum, a) => sum + a.balance.milliunits, 0);
      const totalUnapproved = accounts.reduce((sum, a) => sum + a.unapproved_count, 0);
      const totalUncategorized = accounts.reduce((sum, a) => sum + a.uncategorized_count, 0);

      return {
        accounts,
        totals: {
          total_balance: { milliunits: totalBalance, formatted: this.formatCurrency(totalBalance) },
          total_unapproved: totalUnapproved,
          total_uncategorized: totalUncategorized,
        },
        account_count: accounts.length,
        api_calls_used: 3,
      };
    } catch (error) {
      this.handleError(error, 'get account summary');
    }
  }
}
