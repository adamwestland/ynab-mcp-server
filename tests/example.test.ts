import { describe, it, expect } from 'vitest';
import { milliunitsToAmount, amountToMilliunits, formatCurrency } from '../src/utils/index.js';

describe('Utility Functions', () => {
  describe('milliunitsToAmount', () => {
    it('should convert milliunits to amount correctly', () => {
      expect(milliunitsToAmount(1000)).toBe(1);
      expect(milliunitsToAmount(2500)).toBe(2.5);
      expect(milliunitsToAmount(-1000)).toBe(-1);
      expect(milliunitsToAmount(0)).toBe(0);
    });
  });

  describe('amountToMilliunits', () => {
    it('should convert amount to milliunits correctly', () => {
      expect(amountToMilliunits(1)).toBe(1000);
      expect(amountToMilliunits(2.5)).toBe(2500);
      expect(amountToMilliunits(-1)).toBe(-1000);
      expect(amountToMilliunits(0)).toBe(0);
    });

    it('should handle floating point precision', () => {
      expect(amountToMilliunits(1.234)).toBe(1234);
      expect(amountToMilliunits(1.2345)).toBe(1235); // Rounds to nearest
    });
  });

  describe('formatCurrency', () => {
    it('should format currency with default symbol', () => {
      expect(formatCurrency(1000)).toBe('$1.00');
      expect(formatCurrency(2500)).toBe('$2.50');
      expect(formatCurrency(-1000)).toBe('$-1.00');
      expect(formatCurrency(0)).toBe('$0.00');
    });

    it('should format currency with custom symbol', () => {
      expect(formatCurrency(1000, '€')).toBe('€1.00');
      expect(formatCurrency(2500, '£')).toBe('£2.50');
    });

    it('should format currency with custom decimal places', () => {
      expect(formatCurrency(1000, '$', 0)).toBe('$1');
      expect(formatCurrency(1234, '$', 3)).toBe('$1.234');
    });
  });
});