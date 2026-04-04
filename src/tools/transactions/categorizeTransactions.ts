import { z } from 'zod';
import { readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { YnabTool } from '../base.js';
import type { YnabTransactionsResponse, UpdateTransactionWithId, FlagColor } from '../../types/index.js';

const CategorizeTransactionsInputSchema = z.object({
  budget_id: z.string().describe('The ID of the budget'),
  rules_path: z.string().describe('Absolute path to rules.yaml file'),
  account_id: z.string().optional().describe('Only categorize transactions in this account'),
  since_date: z.string().optional().describe('Only process transactions on or after this date (YYYY-MM-DD)'),
  dry_run: z.boolean().optional().default(true).describe('If true (default), return proposals without applying. If false, apply changes immediately.'),
  limit: z.number().optional().default(500).describe('Maximum transactions to process (default: 500)'),
});

type CategorizeTransactionsInput = z.infer<typeof CategorizeTransactionsInputSchema>;

interface Rule {
  name: string;
  match: {
    payee?: string | string[];
    memo?: string | string[];
    amount_eq?: number;
    amount_gte?: number;
    amount_lte?: number;
    day?: number | number[];
    day_window?: { day: number; tolerance?: number };
    accountId?: string;
    account_id?: string;
  };
  set: {
    category?: string;
    category_id?: string;
    memo?: string;
    payee_name?: string;
    approved?: boolean;
    flag?: string;
  };
  stats?: {
    observations?: number;
    confidence?: number;
  };
}

interface Proposal {
  transaction_id: string;
  date: string;
  amount_dollars: string;
  current_payee: string | null;
  current_category: string | null;
  current_memo: string | null;
  rule_name: string;
  proposed_changes: Record<string, unknown>;
}

/**
 * Read rules.yaml and match against uncategorized/unapproved transactions.
 * Returns proposals showing what would change, or applies them directly.
 *
 * Port of the Python RuleEngine from app/rules.py.
 */
export class CategorizeTransactionsTool extends YnabTool {
  name = 'ynab_categorize_transactions';
  description =
    'Apply categorization rules from a YAML file against uncategorized transactions. ' +
    'Reads rules with payee/memo regex patterns, amount matching, and day-of-month matching. ' +
    'Returns proposals by default (dry_run=true). Set dry_run=false to apply immediately.';
  inputSchema = CategorizeTransactionsInputSchema;

  async execute(args: unknown) {
    const input = this.validateArgs<CategorizeTransactionsInput>(args);

    try {
      // Load rules
      const rulesYaml = readFileSync(input.rules_path, 'utf-8');
      const rulesData = parseYaml(rulesYaml) as { rules: Rule[] };
      const rules = rulesData.rules;

      // Fetch uncategorized + unapproved transactions
      const requestOptions: Record<string, unknown> = {};
      if (input.since_date) {
        requestOptions.sinceDate = input.since_date;
      }

      let response: YnabTransactionsResponse;
      if (input.account_id) {
        response = await this.client.getAccountTransactions(
          input.budget_id,
          input.account_id,
          requestOptions,
        );
      } else {
        response = await this.client.getTransactions(input.budget_id, requestOptions);
      }

      // Filter to only uncategorized or unapproved, non-transfer transactions
      const candidates = response.transactions.filter(t => {
        if (t.payee_name?.startsWith('Transfer : ')) return false;
        if (t.transfer_account_id) return false;
        const needsCategory = !t.category_id || t.category_name === 'Uncategorized';
        const needsApproval = !t.approved;
        return needsCategory || needsApproval;
      });

      // Apply rules — first match wins
      const proposals: Proposal[] = [];
      let matched = 0;
      let alreadyCategorized = 0;

      const toProcess = candidates.slice(0, input.limit);

      for (const txn of toProcess) {
        const rule = this.findMatchingRule(rules, txn);
        if (!rule) continue;

        matched++;
        const changes: Record<string, unknown> = {};

        // Only set category if transaction is uncategorized
        const isUncategorized = !txn.category_id || txn.category_name === 'Uncategorized';
        if (isUncategorized && rule.set.category) {
          changes.category = rule.set.category;
        } else if (!isUncategorized) {
          alreadyCategorized++;
        }

        if (rule.set.memo) changes.memo = rule.set.memo;
        if (rule.set.payee_name) changes.payee_name = rule.set.payee_name;
        if (rule.set.flag) changes.flag = rule.set.flag;
        changes.approved = rule.set.approved ?? true;

        if (Object.keys(changes).length === 0) continue;

        proposals.push({
          transaction_id: txn.id,
          date: txn.date,
          amount_dollars: (txn.amount / 1000).toFixed(2),
          current_payee: txn.payee_name,
          current_category: txn.category_name,
          current_memo: txn.memo,
          rule_name: rule.name,
          proposed_changes: changes,
        });
      }

      // Apply if not dry run
      let applied = 0;
      if (!input.dry_run && proposals.length > 0) {
        // We need category IDs, not names. Resolve them.
        const categories = await this.client.getCategories(input.budget_id);
        const categoryMap = new Map<string, string>();
        for (const group of categories.category_groups) {
          for (const cat of group.categories) {
            // Map multiple formats: "Group:Category", "Category", "GroupCategory"
            categoryMap.set(cat.name.toLowerCase(), cat.id);
            const fullName = `${group.name}:${cat.name}`;
            categoryMap.set(fullName.toLowerCase(), cat.id);
            const spaceless = `${group.name}${cat.name}`.replace(/\s+/g, '');
            categoryMap.set(spaceless.toLowerCase(), cat.id);
          }
        }

        // Batch update in chunks of 100
        const batchSize = 100;
        for (let i = 0; i < proposals.length; i += batchSize) {
          const batch = proposals.slice(i, i + batchSize);
          const updates: UpdateTransactionWithId[] = batch.map(p => {
            const update: UpdateTransactionWithId = {
              id: p.transaction_id,
              approved: (p.proposed_changes.approved as boolean) ?? true,
            };

            if (p.proposed_changes.category) {
              const catName = String(p.proposed_changes.category).toLowerCase();
              const catId = categoryMap.get(catName);
              if (catId) {
                update.category_id = catId;
              }
            }
            if (p.proposed_changes.memo) update.memo = p.proposed_changes.memo as string;
            if (p.proposed_changes.payee_name) update.payee_name = p.proposed_changes.payee_name as string;
            if (p.proposed_changes.flag) update.flag_color = p.proposed_changes.flag as FlagColor;

            return update;
          });

          await this.client.updateTransactions(input.budget_id, updates);
          applied += updates.length;
        }
      }

      // Summarize by rule
      const ruleHits = new Map<string, number>();
      for (const p of proposals) {
        ruleHits.set(p.rule_name, (ruleHits.get(p.rule_name) || 0) + 1);
      }
      const ruleSummary = Array.from(ruleHits.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ rule: name, matches: count }));

      return {
        summary: {
          total_candidates: candidates.length,
          processed: toProcess.length,
          matched,
          already_categorized: alreadyCategorized,
          unmatched: toProcess.length - matched,
          dry_run: input.dry_run,
          applied,
        },
        rules_loaded: rules.length,
        rule_summary: ruleSummary,
        proposals: input.dry_run ? proposals : `${applied} changes applied`,
      };
    } catch (error) {
      this.handleError(error, 'categorize transactions');
    }
  }

  private findMatchingRule(
    rules: Rule[],
    txn: { payee_name: string | null; memo: string | null; amount: number; date: string; account_id: string },
  ): Rule | null {
    for (const rule of rules) {
      if (this.matchesRule(rule.match, txn)) {
        return rule;
      }
    }
    return null;
  }

  private matchesRule(
    spec: Rule['match'],
    txn: { payee_name: string | null; memo: string | null; amount: number; date: string; account_id: string },
  ): boolean {
    // Account ID check
    const accountId = spec.account_id || spec.accountId;
    if (accountId && txn.account_id !== accountId) return false;

    // Payee / memo pattern matching
    const payeePatterns = spec.payee;
    const memoPatterns = spec.memo;

    if (payeePatterns || memoPatterns) {
      let matchesAny = false;

      const relaxed = (pat: string): string => {
        if (pat.startsWith('^')) pat = pat.slice(1);
        if (pat.endsWith('$')) pat = pat.slice(0, -1);
        return pat;
      };

      // Payee patterns — check against both payee_name and memo
      if (payeePatterns) {
        const patterns = Array.isArray(payeePatterns) ? payeePatterns : [payeePatterns];
        const payeeText = txn.payee_name || '';
        const memoText = txn.memo || '';

        for (const pattern of patterns) {
          const relaxedPattern = relaxed(pattern);
          try {
            const re = new RegExp(relaxedPattern, 'i');
            if (re.test(payeeText) || re.test(memoText)) {
              matchesAny = true;
              break;
            }
          } catch {
            // Invalid regex — try literal match
            if (payeeText.toLowerCase().includes(relaxedPattern.toLowerCase()) ||
                memoText.toLowerCase().includes(relaxedPattern.toLowerCase())) {
              matchesAny = true;
              break;
            }
          }
        }
      }

      // Memo patterns (explicit)
      if (memoPatterns && !matchesAny) {
        const patterns = Array.isArray(memoPatterns) ? memoPatterns : [memoPatterns];
        const memoTarget = txn.memo || '';
        for (const pattern of patterns) {
          try {
            if (new RegExp(pattern, 'i').test(memoTarget)) {
              matchesAny = true;
              break;
            }
          } catch {
            if (memoTarget.toLowerCase().includes(pattern.toLowerCase())) {
              matchesAny = true;
              break;
            }
          }
        }
      }

      if (!matchesAny) return false;
    }

    // Amount equality
    if (spec.amount_eq !== undefined && txn.amount !== spec.amount_eq) return false;

    // Amount range
    if (spec.amount_gte !== undefined && txn.amount < spec.amount_gte) return false;
    if (spec.amount_lte !== undefined && txn.amount > spec.amount_lte) return false;

    // Day-of-month matching
    const DEFAULT_DAY_TOLERANCE = 5;

    if (spec.day_window) {
      const scheduled = spec.day_window.day;
      const tol = spec.day_window.tolerance ?? DEFAULT_DAY_TOLERANCE;
      const txnDay = new Date(txn.date + 'T00:00:00').getDate();
      if (!this.dayWithin(txnDay, scheduled, tol)) return false;
    } else if (spec.day !== undefined) {
      const txnDay = new Date(txn.date + 'T00:00:00').getDate();
      if (Array.isArray(spec.day)) {
        if (!spec.day.includes(txnDay)) return false;
      } else {
        if (!this.dayWithin(txnDay, spec.day, DEFAULT_DAY_TOLERANCE)) return false;
      }
    }

    return true;
  }

  private dayWithin(txnDay: number, targetDay: number, tolerance: number): boolean {
    if (txnDay === targetDay) return true;
    const diff = Math.abs(txnDay - targetDay);
    if (diff <= tolerance) return true;
    // Wrap-around at month edges
    const wrapDiff = Math.min((txnDay + 31) - targetDay, (targetDay + 31) - txnDay);
    return wrapDiff <= tolerance;
  }
}
