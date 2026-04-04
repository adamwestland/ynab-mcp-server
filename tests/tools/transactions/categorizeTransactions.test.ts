/**
 * CategorizeTransactionsTool Unit Tests
 *
 * Tests the rule engine that reads rules.yaml and matches against transactions.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CategorizeTransactionsTool } from '../../../src/tools/transactions/categorizeTransactions.js';
import { createMockClient, type MockYNABClient } from '../../helpers/mockClient.js';
import { createMockTransaction } from '../../helpers/fixtures.js';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Helper to write a temp rules file
function writeTempRules(rules: object[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'ynab-test-'));
  const path = join(dir, 'rules.yaml');
  const yaml = `version: 1\nrules:\n${rules.map(r => {
    const lines: string[] = [];
    const rule = r as Record<string, unknown>;
    lines.push(`- name: "${rule.name}"`);
    lines.push(`  match:`);
    const match = rule.match as Record<string, unknown>;
    if (match.payee) {
      const payees = Array.isArray(match.payee) ? match.payee : [match.payee];
      lines.push(`    payee:`);
      payees.forEach((p: string) => lines.push(`    - ${p}`));
    }
    if (match.memo) {
      const memos = Array.isArray(match.memo) ? match.memo : [match.memo];
      lines.push(`    memo:`);
      memos.forEach((m: string) => lines.push(`    - ${m}`));
    }
    if (match.amount_eq !== undefined) lines.push(`    amount_eq: ${match.amount_eq}`);
    if (match.amount_gte !== undefined) lines.push(`    amount_gte: ${match.amount_gte}`);
    if (match.amount_lte !== undefined) lines.push(`    amount_lte: ${match.amount_lte}`);
    if (match.day !== undefined) lines.push(`    day: ${match.day}`);
    if (match.accountId) lines.push(`    accountId: ${match.accountId}`);
    lines.push(`  set:`);
    const set = rule.set as Record<string, unknown>;
    if (set.category) lines.push(`    category: "${set.category}"`);
    if (set.approved !== undefined) lines.push(`    approved: ${set.approved}`);
    if (set.flag) lines.push(`    flag: ${set.flag}`);
    return lines.join('\n');
  }).join('\n')}`;
  writeFileSync(path, yaml);
  return path;
}

describe('CategorizeTransactionsTool', () => {
  let client: MockYNABClient;
  let tool: CategorizeTransactionsTool;
  let tempDirs: string[] = [];

  beforeEach(() => {
    client = createMockClient();
    tool = new CategorizeTransactionsTool(client as any);
  });

  afterEach(() => {
    // Clean up temp files
    tempDirs.forEach(d => rmSync(d, { recursive: true, force: true }));
    tempDirs = [];
  });

  function writeRules(rules: object[]): string {
    const path = writeTempRules(rules);
    tempDirs.push(join(path, '..'));
    return path;
  }

  describe('metadata', () => {
    it('has correct name', () => {
      expect(tool.name).toBe('ynab_categorize_transactions');
    });

    it('has description', () => {
      expect(tool.description).toBeTruthy();
    });
  });

  describe('rule matching', () => {
    it('matches transactions by payee name regex', async () => {
      const rulesPath = writeRules([{
        name: 'Groceries',
        match: { payee: ['^FreshCo$'] },
        set: { category: 'Food:Groceries' },
      }]);

      client.getAccountTransactions.mockResolvedValue({
        transactions: [
          createMockTransaction({
            id: 'tx-1',
            payee_name: 'FreshCo',
            category_id: null,
            category_name: 'Uncategorized',
            approved: false,
          }),
        ],
        server_knowledge: 1,
      });

      const result = await tool.execute({
        budget_id: 'test-budget',
        rules_path: rulesPath,
        account_id: 'test-account',
        dry_run: true,
      }) as any;

      expect(result.summary.matched).toBe(1);
      expect(result.proposals[0].rule_name).toBe('Groceries');
      expect(result.proposals[0].proposed_changes.category).toBe('Food:Groceries');
    });

    it('matches payee patterns against memo field too', async () => {
      const rulesPath = writeRules([{
        name: 'Toronto Parking',
        match: { payee: ['Toronto Parking'] },
        set: { category: 'Transportation:Parking' },
      }]);

      client.getAccountTransactions.mockResolvedValue({
        transactions: [
          createMockTransaction({
            id: 'tx-1',
            payee_name: 'Some Generic Name',
            memo: 'Toronto Parking Authority',
            category_id: null,
            category_name: 'Uncategorized',
            approved: false,
          }),
        ],
        server_knowledge: 1,
      });

      const result = await tool.execute({
        budget_id: 'test-budget',
        rules_path: rulesPath,
        account_id: 'test-account',
        dry_run: true,
      }) as any;

      expect(result.summary.matched).toBe(1);
    });

    it('does not match when payee regex does not match', async () => {
      const rulesPath = writeRules([{
        name: 'Groceries',
        match: { payee: ['^FreshCo$'] },
        set: { category: 'Food:Groceries' },
      }]);

      client.getAccountTransactions.mockResolvedValue({
        transactions: [
          createMockTransaction({
            id: 'tx-1',
            payee_name: 'Uber',
            category_id: null,
            category_name: 'Uncategorized',
            approved: false,
          }),
        ],
        server_knowledge: 1,
      });

      const result = await tool.execute({
        budget_id: 'test-budget',
        rules_path: rulesPath,
        account_id: 'test-account',
        dry_run: true,
      }) as any;

      expect(result.summary.matched).toBe(0);
      expect(result.summary.unmatched).toBe(1);
    });

    it('matches with amount_eq constraint', async () => {
      const rulesPath = writeRules([{
        name: 'Uber One',
        match: { payee: ['^Uber$'], amount_eq: -11290 },
        set: { category: 'Misc:UberOne' },
      }, {
        name: 'Uber Trip',
        match: { payee: ['^Uber$'] },
        set: { category: 'Transportation:Taxis' },
      }]);

      client.getAccountTransactions.mockResolvedValue({
        transactions: [
          createMockTransaction({
            id: 'tx-sub',
            payee_name: 'Uber',
            amount: -11290,
            category_id: null,
            category_name: 'Uncategorized',
            approved: false,
          }),
          createMockTransaction({
            id: 'tx-trip',
            payee_name: 'Uber',
            amount: -25000,
            category_id: null,
            category_name: 'Uncategorized',
            approved: false,
          }),
        ],
        server_knowledge: 1,
      });

      const result = await tool.execute({
        budget_id: 'test-budget',
        rules_path: rulesPath,
        account_id: 'test-account',
        dry_run: true,
      }) as any;

      expect(result.summary.matched).toBe(2);
      const sub = result.proposals.find((p: any) => p.transaction_id === 'tx-sub');
      const trip = result.proposals.find((p: any) => p.transaction_id === 'tx-trip');
      expect(sub.proposed_changes.category).toBe('Misc:UberOne');
      expect(trip.proposed_changes.category).toBe('Transportation:Taxis');
    });

    it('matches with day-of-month constraint', async () => {
      const rulesPath = writeRules([{
        name: 'Apple TV+',
        match: { payee: ['^Apple$'], amount_eq: -14680, day: 2 },
        set: { category: 'Streaming:AppleTV+' },
      }]);

      client.getAccountTransactions.mockResolvedValue({
        transactions: [
          createMockTransaction({
            id: 'tx-1',
            payee_name: 'Apple',
            amount: -14680,
            date: '2025-03-02',
            category_id: null,
            category_name: 'Uncategorized',
            approved: false,
          }),
          createMockTransaction({
            id: 'tx-2',
            payee_name: 'Apple',
            amount: -14680,
            date: '2025-03-15',
            category_id: null,
            category_name: 'Uncategorized',
            approved: false,
          }),
        ],
        server_knowledge: 1,
      });

      const result = await tool.execute({
        budget_id: 'test-budget',
        rules_path: rulesPath,
        account_id: 'test-account',
        dry_run: true,
      }) as any;

      // Day 2 matches, day 15 doesn't (outside ±5 tolerance)
      expect(result.summary.matched).toBe(1);
      expect(result.proposals[0].transaction_id).toBe('tx-1');
    });

    it('respects account_id filter in rules', async () => {
      const rulesPath = writeRules([{
        name: 'RBC 262 Fees',
        match: { payee: ['^RBC$'], accountId: 'account-262' },
        set: { category: '2629012:Bank Fees' },
      }, {
        name: 'RBC Personal Fees',
        match: { payee: ['^RBC$'] },
        set: { category: 'Personal:Bank Fees' },
      }]);

      client.getAccountTransactions.mockResolvedValue({
        transactions: [
          createMockTransaction({
            id: 'tx-1',
            payee_name: 'RBC',
            account_id: 'account-personal',
            category_id: null,
            category_name: 'Uncategorized',
            approved: false,
          }),
        ],
        server_knowledge: 1,
      });

      const result = await tool.execute({
        budget_id: 'test-budget',
        rules_path: rulesPath,
        account_id: 'account-personal',
        dry_run: true,
      }) as any;

      // Should skip the 262 rule (wrong account) and match the personal rule
      expect(result.summary.matched).toBe(1);
      expect(result.proposals[0].proposed_changes.category).toBe('Personal:Bank Fees');
    });

    it('skips transfer transactions', async () => {
      const rulesPath = writeRules([{
        name: 'Catch All',
        match: { payee: ['.*'] },
        set: { category: 'Misc' },
      }]);

      client.getAccountTransactions.mockResolvedValue({
        transactions: [
          createMockTransaction({
            id: 'tx-transfer',
            payee_name: 'Transfer : WS Card *1853',
            transfer_account_id: 'ws-card-id',
            category_id: null,
            category_name: 'Uncategorized',
            approved: false,
          }),
          createMockTransaction({
            id: 'tx-normal',
            payee_name: 'Coffee Shop',
            category_id: null,
            category_name: 'Uncategorized',
            approved: false,
          }),
        ],
        server_knowledge: 1,
      });

      const result = await tool.execute({
        budget_id: 'test-budget',
        rules_path: rulesPath,
        account_id: 'test-account',
        dry_run: true,
      }) as any;

      // Only the non-transfer should be processed
      expect(result.summary.total_candidates).toBe(1);
      expect(result.summary.matched).toBe(1);
      expect(result.proposals[0].transaction_id).toBe('tx-normal');
    });

    it('first matching rule wins', async () => {
      const rulesPath = writeRules([{
        name: 'Specific Amazon',
        match: { payee: ['Amazon'], amount_eq: -11290 },
        set: { category: 'Streaming:Amazon Prime' },
      }, {
        name: 'Generic Amazon',
        match: { payee: ['Amazon'] },
        set: { category: 'Shopping:Amazon' },
      }]);

      client.getAccountTransactions.mockResolvedValue({
        transactions: [
          createMockTransaction({
            id: 'tx-prime',
            payee_name: 'Amazon',
            amount: -11290,
            category_id: null,
            category_name: 'Uncategorized',
            approved: false,
          }),
        ],
        server_knowledge: 1,
      });

      const result = await tool.execute({
        budget_id: 'test-budget',
        rules_path: rulesPath,
        account_id: 'test-account',
        dry_run: true,
      }) as any;

      expect(result.proposals[0].rule_name).toBe('Specific Amazon');
      expect(result.proposals[0].proposed_changes.category).toBe('Streaming:Amazon Prime');
    });

    it('returns rule summary with hit counts', async () => {
      const rulesPath = writeRules([{
        name: 'Groceries',
        match: { payee: ['FreshCo', 'Farm Boy'] },
        set: { category: 'Food:Groceries' },
      }]);

      client.getAccountTransactions.mockResolvedValue({
        transactions: [
          createMockTransaction({ id: 'tx-1', payee_name: 'FreshCo', category_id: null, category_name: 'Uncategorized', approved: false }),
          createMockTransaction({ id: 'tx-2', payee_name: 'Farm Boy', category_id: null, category_name: 'Uncategorized', approved: false }),
          createMockTransaction({ id: 'tx-3', payee_name: 'FreshCo', category_id: null, category_name: 'Uncategorized', approved: false }),
        ],
        server_knowledge: 1,
      });

      const result = await tool.execute({
        budget_id: 'test-budget',
        rules_path: rulesPath,
        account_id: 'test-account',
        dry_run: true,
      }) as any;

      expect(result.rule_summary).toEqual([{ rule: 'Groceries', matches: 3 }]);
    });

    it('matches memo-only patterns', async () => {
      const rulesPath = writeRules([{
        name: 'Cashback',
        match: { memo: ['^Cash ?back - Cash Card$'] },
        set: { category: 'Income:Cashback' },
      }]);

      client.getAccountTransactions.mockResolvedValue({
        transactions: [
          createMockTransaction({
            id: 'tx-1',
            payee_name: 'Cashback - Cash Card',
            memo: 'Cashback - Cash Card',
            category_id: null,
            category_name: 'Uncategorized',
            approved: false,
          }),
        ],
        server_knowledge: 1,
      });

      const result = await tool.execute({
        budget_id: 'test-budget',
        rules_path: rulesPath,
        account_id: 'test-account',
        dry_run: true,
      }) as any;

      expect(result.summary.matched).toBe(1);
      expect(result.proposals[0].proposed_changes.category).toBe('Income:Cashback');
    });
  });

  describe('dry_run behavior', () => {
    it('defaults to dry_run=true and does not call update', async () => {
      const rulesPath = writeRules([{
        name: 'Test',
        match: { payee: ['^Test$'] },
        set: { category: 'Test:Category' },
      }]);

      client.getAccountTransactions.mockResolvedValue({
        transactions: [
          createMockTransaction({ id: 'tx-1', payee_name: 'Test', category_id: null, category_name: 'Uncategorized', approved: false }),
        ],
        server_knowledge: 1,
      });

      const result = await tool.execute({
        budget_id: 'test-budget',
        rules_path: rulesPath,
        account_id: 'test-account',
      }) as any;

      expect(result.summary.dry_run).toBe(true);
      expect(result.summary.applied).toBe(0);
      expect(client.updateTransactions).not.toHaveBeenCalled();
    });
  });
});
