/**
 * Utility functions for handling cost formatting in micro-cents
 * Micro-cents are millionths of a dollar, used for precise cost tracking
 */

/**
 * Convert micro-cents to dollars
 * @param microCents Cost in micro-cents (millionths of a dollar)
 * @returns Cost in dollars as a number
 */
export function microCentsToDollars(microCents: number): number {
  return microCents / 1_000_000;
}

/**
 * Format micro-cents as a currency string
 * @param microCents Cost in micro-cents (millionths of a dollar)
 * @param precision Number of decimal places (default: 4 for UI display)
 * @returns Formatted currency string (e.g., "$0.1235")
 */
export function formatCostFromMicroCents(
  microCents: number,
  precision: number = 4
): string {
  const dollars = microCentsToDollars(microCents);
  return `$${dollars.toFixed(precision)}`;
}

/**
 * Convert dollars to micro-cents
 * @param dollars Cost in dollars
 * @returns Cost in micro-cents (millionths of a dollar)
 */
export function dollarsToMicroCents(dollars: number): number {
  return Math.round(dollars * 1_000_000);
}
