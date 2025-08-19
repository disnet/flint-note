import { describe, it, expect } from 'vitest';
import {
  microCentsToDollars,
  formatCostFromMicroCents,
  dollarsToMicroCents
} from '../../renderer/src/lib/costUtils.svelte';

describe('costUtils', () => {
  describe('microCentsToDollars', () => {
    it('should convert micro-cents to dollars correctly', () => {
      expect(microCentsToDollars(1_000_000)).toBe(1);
      expect(microCentsToDollars(500_000)).toBe(0.5);
      expect(microCentsToDollars(123_456)).toBe(0.123456);
      expect(microCentsToDollars(0)).toBe(0);
    });

    it('should handle fractional micro-cents', () => {
      expect(microCentsToDollars(1)).toBe(0.000001);
      expect(microCentsToDollars(10)).toBe(0.00001);
      expect(microCentsToDollars(100)).toBe(0.0001);
    });

    it('should handle large values', () => {
      expect(microCentsToDollars(1_000_000_000)).toBe(1000);
      expect(microCentsToDollars(999_999_999)).toBe(999.999999);
    });

    it('should handle negative values', () => {
      expect(microCentsToDollars(-1_000_000)).toBe(-1);
      expect(microCentsToDollars(-500_000)).toBe(-0.5);
    });
  });

  describe('formatCostFromMicroCents', () => {
    it('should format micro-cents as currency with default precision', () => {
      expect(formatCostFromMicroCents(1_000_000)).toBe('$1.0000');
      expect(formatCostFromMicroCents(500_000)).toBe('$0.5000');
      expect(formatCostFromMicroCents(123_456)).toBe('$0.1235');
    });

    it('should format with custom precision', () => {
      expect(formatCostFromMicroCents(1_000_000, 2)).toBe('$1.00');
      expect(formatCostFromMicroCents(1_234_567, 6)).toBe('$1.234567');
      expect(formatCostFromMicroCents(999_999, 3)).toBe('$1.000');
    });

    it('should handle zero values', () => {
      expect(formatCostFromMicroCents(0)).toBe('$0.0000');
      expect(formatCostFromMicroCents(0, 2)).toBe('$0.00');
    });

    it('should handle very small values', () => {
      expect(formatCostFromMicroCents(1)).toBe('$0.0000');
      expect(formatCostFromMicroCents(1, 6)).toBe('$0.000001');
      expect(formatCostFromMicroCents(10, 5)).toBe('$0.00001');
    });

    it('should handle large values', () => {
      expect(formatCostFromMicroCents(1_000_000_000)).toBe('$1000.0000');
      expect(formatCostFromMicroCents(1_234_567_890, 2)).toBe('$1234.57');
    });

    it('should handle negative values', () => {
      expect(formatCostFromMicroCents(-1_000_000)).toBe('$-1.0000');
      expect(formatCostFromMicroCents(-500_000, 2)).toBe('$-0.50');
    });

    it('should round properly when precision is lower than actual', () => {
      expect(formatCostFromMicroCents(1_234_567, 2)).toBe('$1.23');
      expect(formatCostFromMicroCents(1_235_567, 2)).toBe('$1.24');
      expect(formatCostFromMicroCents(999_999, 2)).toBe('$1.00');
    });
  });

  describe('dollarsToMicroCents', () => {
    it('should convert dollars to micro-cents correctly', () => {
      expect(dollarsToMicroCents(1)).toBe(1_000_000);
      expect(dollarsToMicroCents(0.5)).toBe(500_000);
      expect(dollarsToMicroCents(0.123456)).toBe(123_456);
      expect(dollarsToMicroCents(0)).toBe(0);
    });

    it('should handle very small dollar amounts', () => {
      expect(dollarsToMicroCents(0.000001)).toBe(1);
      expect(dollarsToMicroCents(0.00001)).toBe(10);
      expect(dollarsToMicroCents(0.0001)).toBe(100);
    });

    it('should handle large dollar amounts', () => {
      expect(dollarsToMicroCents(1000)).toBe(1_000_000_000);
      expect(dollarsToMicroCents(999.999999)).toBe(999_999_999);
    });

    it('should handle negative values', () => {
      expect(dollarsToMicroCents(-1)).toBe(-1_000_000);
      expect(dollarsToMicroCents(-0.5)).toBe(-500_000);
    });

    it('should round to nearest micro-cent', () => {
      // Test precision limits - JavaScript floating point precision
      expect(dollarsToMicroCents(0.1234567)).toBe(123_457);
      expect(dollarsToMicroCents(0.1234563)).toBe(123_456);
    });

    it('should handle edge cases with floating point precision', () => {
      // These test the Math.round behavior for edge cases
      expect(dollarsToMicroCents(0.0000005)).toBe(1);
      expect(dollarsToMicroCents(0.0000004)).toBe(0);
    });
  });

  describe('round-trip conversions', () => {
    it('should maintain precision for round-trip micro-cents -> dollars -> micro-cents', () => {
      const testValues = [0, 1, 100, 1_000, 123_456, 1_000_000, 999_999_999];

      testValues.forEach((microCents) => {
        const dollars = microCentsToDollars(microCents);
        const backToMicroCents = dollarsToMicroCents(dollars);
        expect(backToMicroCents).toBe(microCents);
      });
    });

    it('should maintain reasonable precision for round-trip dollars -> micro-cents -> dollars', () => {
      const testValues = [0, 0.01, 0.5, 1, 10.5, 100.123456];

      testValues.forEach((dollars) => {
        const microCents = dollarsToMicroCents(dollars);
        const backToDollars = microCentsToDollars(microCents);
        // Allow for small floating point precision differences
        expect(backToDollars).toBeCloseTo(dollars, 6);
      });
    });
  });

  describe('financial accuracy edge cases', () => {
    it('should handle common financial amounts correctly', () => {
      // Common cent amounts
      expect(dollarsToMicroCents(0.01)).toBe(10_000);
      expect(dollarsToMicroCents(0.25)).toBe(250_000);
      expect(dollarsToMicroCents(0.99)).toBe(990_000);

      // Common dollar amounts
      expect(formatCostFromMicroCents(10_000, 2)).toBe('$0.01');
      expect(formatCostFromMicroCents(250_000, 2)).toBe('$0.25');
      expect(formatCostFromMicroCents(990_000, 2)).toBe('$0.99');
    });

    it('should handle API pricing scenarios', () => {
      // Typical AI API costs (very small amounts)
      const inputTokenCost = dollarsToMicroCents(0.000003); // $0.003 per 1K tokens
      const outputTokenCost = dollarsToMicroCents(0.000015); // $0.015 per 1K tokens

      expect(inputTokenCost).toBe(3);
      expect(outputTokenCost).toBe(15);

      expect(formatCostFromMicroCents(inputTokenCost, 6)).toBe('$0.000003');
      expect(formatCostFromMicroCents(outputTokenCost, 6)).toBe('$0.000015');
    });
  });
});
