import { describe, it, expect } from 'vitest';
import { assertPayeeNameAllowed, RESERVED_PAYEE_NAMES } from '../../../src/tools/common/reservedPayees.js';

describe('assertPayeeNameAllowed', () => {
  it('is a no-op for undefined and empty strings', () => {
    expect(() => assertPayeeNameAllowed(undefined)).not.toThrow();
    expect(() => assertPayeeNameAllowed(null)).not.toThrow();
    expect(() => assertPayeeNameAllowed('')).not.toThrow();
  });

  it('allows ordinary payee names', () => {
    expect(() => assertPayeeNameAllowed('Starbucks')).not.toThrow();
    expect(() => assertPayeeNameAllowed('Adjustment')).not.toThrow();
    expect(() => assertPayeeNameAllowed('Reconciliation')).not.toThrow();
  });

  it.each(RESERVED_PAYEE_NAMES)('rejects reserved name "%s"', (name) => {
    expect(() => assertPayeeNameAllowed(name)).toThrow(/reserved by YNAB/i);
  });

  it('matches reserved names case-insensitively', () => {
    expect(() => assertPayeeNameAllowed('reconciliation balance adjustment')).toThrow(/reserved by YNAB/i);
    expect(() => assertPayeeNameAllowed('STARTING BALANCE')).toThrow(/reserved by YNAB/i);
  });

  it('trims surrounding whitespace before comparing', () => {
    expect(() => assertPayeeNameAllowed('  Manual Balance Adjustment  ')).toThrow(/reserved by YNAB/i);
  });

  it('lists all reserved names in the error message so callers can see alternatives', () => {
    let caught: unknown;
    try {
      assertPayeeNameAllowed('Starting Balance');
    } catch (e) {
      caught = e;
    }
    const msg = (caught as Error).message;
    for (const n of RESERVED_PAYEE_NAMES) {
      expect(msg).toContain(n);
    }
  });
});
