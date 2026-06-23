import type { ToolResponse } from '../types.ts';

/**
 * Wrap an error message in the openclaw `ToolResponse` shape so tools
 * can return user-legible errors without throwing. The agent sees the
 * full message verbatim.
 *
 * @param message - The error text to surface to the agent.
 * @returns A ToolResponse with a single text content block.
 */
export function errorResponse(message: string): ToolResponse {
  return {
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
    details: undefined,
  };
}

/**
 * Format a USD amount with two decimal places and thousands
 * separators. The orchestration demo deals in dollar-and-cents
 * quantities throughout; using a single helper keeps the audience-
 * facing text consistent across charge receipts, error messages, and
 * balance reports.
 *
 * @param amount - The USD amount.
 * @returns The formatted string, e.g. `"$22.50"` or `"$1,200.00"`.
 */
export function formatUsd(amount: number): string {
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
