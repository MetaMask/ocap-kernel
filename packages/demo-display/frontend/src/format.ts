/**
 * Shared formatting helpers for the demo-display frontend. Right now
 * just USD rendering, but the file is here so additional formatters
 * (timestamps, percentages, etc.) have a settled home.
 */

/**
 * Format a USD amount with two decimal places and thousands
 * separators. The dashboard renders dollar-and-cents quantities
 * across multiple components (wallet ribbon, charge/credit log
 * entries, service-card price chips); centralising the format avoids
 * a balance of `$22.5` next to a charge of `$22.50` in adjacent
 * components.
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
