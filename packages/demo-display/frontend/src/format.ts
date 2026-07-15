/**
 * Shared formatting helpers for the demo-display frontend. Right now
 * just USD rendering, but the file is here so additional formatters
 * (timestamps, percentages, etc.) have a settled home.
 */

/**
 * Format a USD amount (already in dollars) with two decimal places
 * and thousands separators. Used by the services grid to render
 * `priceUsd` fields carried on `service.discovered` events — those
 * are advertised list prices sent from the matcher in whole
 * dollars, distinct from the cent-denominated wallet-event pipeline.
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

/**
 * Format an amount denominated in integer USD cents as a dollar
 * string with two decimal places and thousands separators. The
 * event pipeline (`wallet.balance`, `wallet.charge`, `wallet.credit`)
 * carries integer-cents payloads; this helper does the render-time
 * conversion so a balance of `2250` cents renders as `"$22.50"`
 * and a charge of `120000` cents renders as `"$1,200.00"`.
 *
 * @param cents - The amount in integer USD cents.
 * @returns The formatted dollar string.
 */
export function formatUsdFromCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
