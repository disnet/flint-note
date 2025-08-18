/**
 * Utility functions for handling cost formatting in micro-cents
 * Micro-cents are millionths of a dollar, used for precise cost tracking
 */
/**
 * Convert micro-cents to dollars
 * @param microCents Cost in micro-cents (millionths of a dollar)
 * @returns Cost in dollars as a number
 */
export declare function microCentsToDollars(microCents: number): number;
/**
 * Format micro-cents as a currency string
 * @param microCents Cost in micro-cents (millionths of a dollar)
 * @param precision Number of decimal places (default: 4 for UI display)
 * @returns Formatted currency string (e.g., "$0.1235")
 */
export declare function formatCostFromMicroCents(microCents: number, precision?: number): string;
/**
 * Convert dollars to micro-cents
 * @param dollars Cost in dollars
 * @returns Cost in micro-cents (millionths of a dollar)
 */
export declare function dollarsToMicroCents(dollars: number): number;
