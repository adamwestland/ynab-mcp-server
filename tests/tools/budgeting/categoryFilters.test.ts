import { describe, it, expect } from 'vitest';
import {
  filterCategories,
  getClosedCcAccountNames,
  CLOSED_CC_ACCOUNT_TYPES,
} from '../../../src/tools/budgeting/categoryFilters.js';
import { createMockCategory, createMockAccount } from '../../helpers/fixtures.js';

describe('getClosedCcAccountNames', () => {
  it('returns names of closed debt-like accounts only', () => {
    const accounts = [
      createMockAccount({ name: 'Open Visa', type: 'creditCard', closed: false }),
      createMockAccount({ name: 'Closed Amex', type: 'creditCard', closed: true }),
      createMockAccount({ name: 'Closed LoC', type: 'lineOfCredit', closed: true }),
      createMockAccount({ name: 'Closed Checking', type: 'checking', closed: true }),
      createMockAccount({ name: 'Closed Loan', type: 'otherDebt', closed: true }),
    ];
    const names = getClosedCcAccountNames(accounts);
    expect(names).toContain('Closed Amex');
    expect(names).toContain('Closed LoC');
    expect(names).toContain('Closed Loan');
    expect(names).not.toContain('Open Visa');
    expect(names).not.toContain('Closed Checking');
  });

  it('recognises every debt-like account type', () => {
    for (const type of CLOSED_CC_ACCOUNT_TYPES) {
      const accts = [createMockAccount({ name: `X-${type}`, type, closed: true })];
      expect(getClosedCcAccountNames(accts)).toEqual([`X-${type}`]);
    }
  });
});

describe('filterCategories', () => {
  const cats = () => [
    createMockCategory({ id: 'c-food', name: 'Food', category_group_name: 'Groceries' }),
    createMockCategory({ id: 'c-hidden', name: 'Old Toys', hidden: true, category_group_name: 'Fun' }),
    createMockCategory({ id: 'c-deleted', name: 'Gone', deleted: true, category_group_name: 'Fun' }),
    createMockCategory({ id: 'c-rta', name: 'Inflow: Ready to Assign', category_group_name: 'Internal Master Category' }),
    createMockCategory({ id: 'c-cc-open', name: 'Open Visa', category_group_name: 'Credit Card Payments' }),
    createMockCategory({ id: 'c-cc-closed', name: 'Closed Amex', category_group_name: 'Credit Card Payments' }),
  ];

  it('drops Ready-to-Assign always (never fundable)', () => {
    const { kept } = filterCategories(cats());
    expect(kept.map(c => c.id)).not.toContain('c-rta');
  });

  it('drops hidden and deleted by default', () => {
    const { kept } = filterCategories(cats());
    expect(kept.map(c => c.id)).not.toContain('c-hidden');
    expect(kept.map(c => c.id)).not.toContain('c-deleted');
  });

  it('keeps hidden when skip_hidden=false', () => {
    const { kept } = filterCategories(cats(), { skip_hidden: false });
    expect(kept.map(c => c.id)).toContain('c-hidden');
  });

  it('never keeps deleted (safety: always skipped)', () => {
    const { kept } = filterCategories(cats(), { skip_deleted: false });
    expect(kept.map(c => c.id)).not.toContain('c-deleted');
  });

  it('applies include list (by id)', () => {
    const { kept } = filterCategories(cats(), { include: ['c-food'] });
    expect(kept.map(c => c.id)).toEqual(['c-food']);
  });

  it('applies include list (by name, case-insensitive)', () => {
    const { kept } = filterCategories(cats(), { include: ['food'] });
    expect(kept.map(c => c.id)).toEqual(['c-food']);
  });

  it('applies exclude list (by id or name)', () => {
    const { kept } = filterCategories(cats(), { exclude: ['c-food', 'open visa'] });
    expect(kept.map(c => c.id)).not.toContain('c-food');
    expect(kept.map(c => c.id)).not.toContain('c-cc-open');
  });

  it('drops closed-CC categories when names supplied', () => {
    const { kept } = filterCategories(cats(), {
      closed_cc_account_names: ['Closed Amex'],
    });
    expect(kept.map(c => c.id)).toContain('c-cc-open');
    expect(kept.map(c => c.id)).not.toContain('c-cc-closed');
  });

  it('only matches closed-CC within the Credit Card Payments group (safe fail)', () => {
    // A regular category that happens to share a name with a closed CC account
    // should NOT be filtered out, because closed-CC matching is scoped to the
    // CC Payments group.
    const list = [
      ...cats(),
      createMockCategory({ id: 'c-namesake', name: 'Closed Amex', category_group_name: 'Groceries' }),
    ];
    const { kept } = filterCategories(list, { closed_cc_account_names: ['Closed Amex'] });
    expect(kept.map(c => c.id)).toContain('c-namesake');
    expect(kept.map(c => c.id)).not.toContain('c-cc-closed');
  });

  it('records per-skip reasons for audit', () => {
    const { skipped } = filterCategories(cats(), { exclude: ['c-food'], closed_cc_account_names: ['Closed Amex'] });
    const byId = Object.fromEntries(skipped.map(s => [s.category_id, s.reason]));
    expect(byId['c-food']).toBe('excluded');
    expect(byId['c-rta']).toBe('ready_to_assign');
    expect(byId['c-hidden']).toBe('hidden');
    expect(byId['c-deleted']).toBe('deleted');
    expect(byId['c-cc-closed']).toBe('closed_cc');
  });

  describe('skip_goal_carryover (sweep-style)', () => {
    it('skips categories with a goal AND positive prior-month carryover', () => {
      const savings = createMockCategory({
        id: 'c-save',
        name: 'Vacation',
        goal_type: 'TB',
        // balance 150, budgeted 50, activity 0 -> prior_carryover = 100
        budgeted: 50000,
        activity: 0,
        balance: 150000,
      });
      const { kept, skipped } = filterCategories([savings], { skip_goal_carryover: true });
      expect(kept).toHaveLength(0);
      expect(skipped[0]!.reason).toBe('goal_carryover');
    });

    it('sweeps a goal category with no prior carryover', () => {
      const justBudgeted = createMockCategory({
        id: 'c-save-fresh',
        name: 'Vacation',
        goal_type: 'TB',
        // balance 50, budgeted 50, activity 0 -> prior_carryover = 0
        budgeted: 50000,
        activity: 0,
        balance: 50000,
      });
      const { kept } = filterCategories([justBudgeted], { skip_goal_carryover: true });
      expect(kept).toHaveLength(1);
    });

    it('sweeps a non-goal category even with prior carryover', () => {
      const noGoal = createMockCategory({
        id: 'c-slush',
        name: 'Slush',
        goal_type: null,
        budgeted: 0,
        activity: 0,
        balance: 100000,
      });
      const { kept } = filterCategories([noGoal], { skip_goal_carryover: true });
      expect(kept).toHaveLength(1);
    });

    it('is disabled by default (other tools keep carryover goals)', () => {
      const savings = createMockCategory({
        id: 'c-save',
        name: 'Vacation',
        goal_type: 'TB',
        budgeted: 50000,
        activity: 0,
        balance: 150000,
      });
      const { kept } = filterCategories([savings]);
      expect(kept).toHaveLength(1);
    });
  });

  it('include takes precedence: categories not in include are dropped even if otherwise kept', () => {
    const { kept, skipped } = filterCategories(cats(), { include: ['c-food'] });
    expect(kept.map(c => c.id)).toEqual(['c-food']);
    const otherIds = cats().filter(c => c.id !== 'c-food' && !c.deleted && !c.hidden && c.category_group_name !== 'Internal Master Category').map(c => c.id);
    for (const id of otherIds) {
      expect(skipped.some(s => s.category_id === id && s.reason === 'not_included')).toBe(true);
    }
  });
});
