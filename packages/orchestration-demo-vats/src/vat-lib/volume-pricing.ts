/**
 * Quantity-aware pricing for sample services.
 *
 * The demo's three "manufacturing-side" services — shenzhen-direct
 * (parts BOM), pcb-wizards (board fab), and assembly-coop (assembly
 * labor) — accept a brief that mentions a target quantity. At
 * prototype scale they return the same baseline numbers they used
 * to; at higher quantities they apply tiered volume discounts and,
 * for the enclosure, switch the manufacturing modality from SLA to
 * injection molding.
 *
 * This module is deliberately thin: it parses a quantity out of an
 * unstructured brief, classifies it into a tier, and exposes the
 * tier's discount factor plus a human-readable label. Each service
 * applies the result locally — there's no centralized pricing
 * function because the line items vary too much to abstract.
 */

/**
 * Volume-pricing tier. Tiers are coarse on purpose; the demo is
 * making a qualitative point ("scales differently at production
 * volume"), not a quantitative one.
 */
export type VolumeTier =
  | 'prototype' // 1-49 units: bench/proto pricing, every line is shelf stock
  | 'small-batch' // 50-499 units: light volume; SLA enclosure starts amortizing
  | 'medium-volume' // 500-4,999: SMT line warms up; enclosure converts to IM
  | 'production'; // 5,000+: high-volume contract pricing

/**
 * Coarse pricing summary the services use to format their reply.
 */
export type VolumeTierProfile = {
  /** The parsed quantity, normalized to a positive integer. */
  quantity: number;
  /** Tier label, see VolumeTier. */
  tier: VolumeTier;
  /** Display name, e.g. "production-volume (5000+ units)". */
  tierLabel: string;
  /**
   * Multiplier applied to baseline per-unit electronic-component
   * costs. 1.0 at prototype scale; drops as volume rises.
   */
  componentMultiplier: number;
  /**
   * Multiplier applied to baseline per-unit labor cost. Drops more
   * steeply than components because labor benefits more from
   * SMT-line amortization.
   */
  laborMultiplier: number;
  /**
   * Per-unit enclosure cost in USD. At prototype/small-batch this
   * is the SLA price; at medium-volume and production it's the
   * amortized injection-molded price (tooling cost folded in).
   */
  enclosureUnitUsd: number;
  /** Manufacturing modality for the enclosure ('SLA' or 'IM'). */
  enclosureModality: 'SLA' | 'injection-molded';
  /**
   * Per-board fabrication cost (USD/board) for the PCB at this
   * tier. Mirrors the same break points as components.
   */
  pcbUnitUsd: number;
  /**
   * Per-unit assembly labor cost (USD/unit) at this tier.
   */
  laborUnitUsd: number;
};

/**
 * Parse a quantity out of a free-text brief. Looks for the most
 * salient "<N> units" pattern in the text; falls back to the
 * provided default if no match.
 *
 * Examples it should pick up:
 *   "15-unit prototype batch"
 *   "5,000 units for production"
 *   "10 units"
 *   "produce 1000 units"
 *
 * @param brief - The free-text brief from the agent.
 * @param defaultQty - Quantity to return if the brief doesn't
 *   mention one. Should be the service's "obvious default" — e.g.
 *   15 for the demo's prototype Manufacturing engagement.
 * @returns A positive integer quantity.
 */
export function parseQuantity(brief: string, defaultQty: number): number {
  // Match "<digits-with-optional-commas> units?" with optional
  // dash separator. Pull the digit run, strip commas, parse.
  const match = brief.match(/(\d{1,3}(?:,\d{3})*|\d+)[-\s]*units?\b/iu);
  if (match) {
    const parsed = Number.parseInt((match[1] as string).replace(/,/gu, ''), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return defaultQty;
}

/**
 * Map a quantity to its `VolumeTier` bucket.
 *
 * @param qty - The unit quantity.
 * @returns The bucket the quantity falls into.
 */
function tierFor(qty: number): VolumeTier {
  if (qty < 50) {
    return 'prototype';
  }
  if (qty < 500) {
    return 'small-batch';
  }
  if (qty < 5_000) {
    return 'medium-volume';
  }
  return 'production';
}

/**
 * Build the full `VolumeTierProfile` for a quantity. The tier-
 * dependent constants here are illustrative, not industry-accurate;
 * the demo's point is the directional fact that production-scale
 * pricing differs meaningfully from prototype pricing.
 *
 * @param quantity - The unit quantity.
 * @returns The pricing profile for this quantity.
 */
export function makeVolumeProfile(quantity: number): VolumeTierProfile {
  // Profiles are returned as plain literals so this module is
  // loadable in unit-test contexts where `harden` is not defined.
  // Callers in the vat context who want the result hardened can
  // `harden(makeVolumeProfile(qty))` at the call site.
  const tier = tierFor(quantity);
  switch (tier) {
    case 'prototype':
      return {
        quantity,
        tier,
        tierLabel: 'prototype scale (under 50 units)',
        componentMultiplier: 1.0,
        laborMultiplier: 1.0,
        enclosureUnitUsd: 58.0,
        enclosureModality: 'SLA',
        pcbUnitUsd: 25.0,
        laborUnitUsd: 16.0,
      };
    case 'small-batch':
      return {
        quantity,
        tier,
        tierLabel: 'small-batch volume (50-499 units)',
        componentMultiplier: 0.85,
        laborMultiplier: 0.75,
        enclosureUnitUsd: 42.0,
        enclosureModality: 'SLA',
        pcbUnitUsd: 12.0,
        laborUnitUsd: 12.0,
      };
    case 'medium-volume':
      return {
        quantity,
        tier,
        tierLabel: 'medium volume (500-4,999 units)',
        componentMultiplier: 0.65,
        laborMultiplier: 0.45,
        // Tooling amortized across the run; effective per-unit at
        // medium volume sits roughly here, dropping further at
        // production scale.
        enclosureUnitUsd: 14.0,
        enclosureModality: 'injection-molded',
        pcbUnitUsd: 4.5,
        laborUnitUsd: 7.2,
      };
    case 'production':
      return {
        quantity,
        tier,
        tierLabel: 'production volume (5,000+ units)',
        componentMultiplier: 0.5,
        laborMultiplier: 0.3,
        enclosureUnitUsd: 8.5,
        enclosureModality: 'injection-molded',
        pcbUnitUsd: 2.4,
        laborUnitUsd: 4.8,
      };
    default:
      throw new Error(`Unknown volume tier: ${tier as string}`);
  }
}

/**
 * Format a USD amount with two decimals and thousands separators.
 *
 * @param amount - The USD amount.
 * @returns The formatted string, e.g. `"$1,234.56"`.
 */
export function formatUsd(amount: number): string {
  return `$${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
