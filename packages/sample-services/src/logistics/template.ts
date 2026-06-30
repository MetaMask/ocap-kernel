/**
 * Fulfillment-plan rendering for pacific-fulfillment. Picks the
 * trial-distribution or storefront-fulfillment variant from a
 * keyword in the brief and scales the cited numbers by the
 * volume tier parsed from the same brief.
 */

import { MASTER_MD_PRODUCTION, MASTER_MD_TRIAL } from './master-md.ts';
import {
  formatUsd,
  makeVolumeProfile,
  parseQuantity,
} from '../vat-lib/volume-pricing.ts';
import type { VolumeTierProfile } from '../vat-lib/volume-pricing.ts';

/* eslint-disable n/no-unsupported-features/node-builtins */

type CryptoSource = {
  getRandomValues: (array: Uint8Array) => Uint8Array;
};

/**
 * Resolve the crypto endowment at call time.
 *
 * @returns The crypto endowment, or `undefined` if unavailable.
 */
function resolveCrypto(): CryptoSource | undefined {
  const bare: unknown = typeof crypto === 'undefined' ? undefined : crypto;
  return (bare ?? (globalThis as { crypto?: unknown }).crypto) as
    | CryptoSource
    | undefined;
}

/* eslint-enable n/no-unsupported-features/node-builtins */

const WAREHOUSE_PROFILES = [
  { warehouseRegion: 'West Coast', warehouseCity: 'Sparks, NV' },
  { warehouseRegion: 'Central', warehouseCity: 'Kansas City, MO' },
  { warehouseRegion: 'East Coast', warehouseCity: 'Allentown, PA' },
] as const;

/**
 * Pick one element from a non-empty array; falls back to the first
 * if crypto is unreachable.
 *
 * @param options - Choices.
 * @returns One of them.
 */
function pickOne<Type>(options: readonly Type[]): Type {
  const source = resolveCrypto();
  if (!source?.getRandomValues) {
    return options[0] as Type;
  }
  const bytes = new Uint8Array(1);
  source.getRandomValues(bytes);
  return options[(bytes[0] as number) % options.length] as Type;
}

export type TemplateInputs = {
  providerLabel: string;
  /**
   * Which template variant to render. `production` is the full
   * storefront-fulfillment plan (default). `trial` is the
   * small-batch distribution variant for shipping a curated list of
   * beta units.
   */
  mode: 'production' | 'trial';
  /** The agent's free-text brief — parsed for a quantity. */
  brief: string;
  /** Default quantity if the brief doesn't mention one. */
  defaultQuantity: number;
};

export type RenderResult = {
  markdown: string;
  profile: VolumeTierProfile;
  /**
   * Setup fee for producing the plan. Scales with the volume tier:
   * small trial runs are cheap to plan; a multi-thousand-unit
   * storefront integration requires more setup work.
   */
  setupFeeUsd: number;
  /**
   * Trial-mode only: the one-time hand-pack labor for the batch.
   * Undefined in production mode.
   */
  trialBatchLaborUsd: number | undefined;
};

/**
 * Render the appropriate fulfillment-plan markdown, with prices
 * scaled to the requested quantity.
 *
 * @param inputs - Caller-supplied inputs.
 * @returns Rendered markdown plus the underlying pricing numbers
 *   so the calling service can echo them in its summary.
 */
export function renderFulfillmentPlan(inputs: TemplateInputs): RenderResult {
  const quantity = parseQuantity(inputs.brief, inputs.defaultQuantity);
  const profile = makeVolumeProfile(quantity);
  const warehouse = pickOne(WAREHOUSE_PROFILES);
  const setupFeeUsd = setupFeeFor(profile.tier, inputs.mode);

  if (inputs.mode === 'trial') {
    const trialBatchLaborUsd = trialLaborFor(quantity);
    const trialShipPerUnit = 8.5;
    const trialShipTotalUsd = trialShipPerUnit * quantity;
    const tokens: Record<string, string> = {
      providerLabel: inputs.providerLabel,
      warehouseRegion: warehouse.warehouseRegion,
      warehouseCity: warehouse.warehouseCity,
      unitCount: `${quantity.toLocaleString()} units`,
      trialPackLabor: formatUsd(trialBatchLaborUsd),
      trialShipFlat: formatUsd(trialShipPerUnit),
      trialShipTotal: formatUsd(trialShipTotalUsd),
      trialLeadDays: trialLeadDaysFor(quantity),
      setupFee: formatUsd(setupFeeUsd),
      tierLabel: profile.tierLabel,
    };
    return {
      markdown: MASTER_MD_TRIAL.replace(
        /\{\{(\w+)\}\}/gu,
        (match, name: string) =>
          name in tokens ? (tokens[name] as string) : match,
      ),
      profile,
      setupFeeUsd,
      trialBatchLaborUsd,
    };
  }

  // Production mode — full storefront integration. Per-unit
  // operational rates stay rates (they're billed against actual
  // order volume by the operator), but the plan now projects
  // first-batch totals so the agent has numbers to quote at scale.
  const storagePerUnitUsd = storagePerUnitFor(profile.tier);
  const pickPackPerOrderUsd = pickPackPerOrderFor(profile.tier);
  const groundZone1to4Usd = 6.8;
  const groundZone5to8Usd = 8.4;
  const intlRateUsd = 24.0;
  const returnRateUsd = 3.9;
  const insertCostUsd = 0.35;
  const monthlyStorageTotalUsd = storagePerUnitUsd * quantity;
  // Conservative all-domestic-ground projection for the inaugural
  // batch — useful so the agent can quote a starting-cost figure
  // even though real costs come from order traffic.
  const inauguralShipTotalUsd =
    (groundZone1to4Usd * 0.4 + groundZone5to8Usd * 0.6) * quantity;
  const firstMonthFloorUsd = firstMonthFloorFor(profile.tier);

  const tokens: Record<string, string> = {
    providerLabel: inputs.providerLabel,
    warehouseRegion: warehouse.warehouseRegion,
    warehouseCity: warehouse.warehouseCity,
    storagePerUnit: formatUsd(storagePerUnitUsd),
    pickPackPerOrder: formatUsd(pickPackPerOrderUsd),
    insertCost: formatUsd(insertCostUsd),
    groundZone1to4: formatUsd(groundZone1to4Usd),
    groundZone5to8: formatUsd(groundZone5to8Usd),
    intlRate: formatUsd(intlRateUsd),
    returnRate: formatUsd(returnRateUsd),
    firstMonthFloor: formatUsd(firstMonthFloorUsd),
    cutOffTime: '3 PM local',
    leadDays: integrationLeadDaysFor(profile.tier),
    setupFee: formatUsd(setupFeeUsd),
    tierLabel: profile.tierLabel,
    projectedQuantity: quantity.toLocaleString(),
    monthlyStorageTotal: formatUsd(monthlyStorageTotalUsd),
    inauguralShipTotal: formatUsd(inauguralShipTotalUsd),
  };
  return {
    markdown: MASTER_MD_PRODUCTION.replace(
      /\{\{(\w+)\}\}/gu,
      (match, name: string) =>
        name in tokens ? (tokens[name] as string) : match,
    ),
    profile,
    setupFeeUsd,
    trialBatchLaborUsd: undefined,
  };
}

/**
 * Setup fee for producing the fulfillment plan, by tier and mode.
 *
 * @param tier - Volume tier from the brief.
 * @param mode - Trial or production.
 * @returns The setup fee in USD.
 */
function setupFeeFor(
  tier: VolumeTierProfile['tier'],
  mode: 'trial' | 'production',
): number {
  if (mode === 'trial') {
    // Trial planning is light no matter the batch size; the volume
    // mostly affects labor and shipping, not the planning effort.
    return 300;
  }
  switch (tier) {
    case 'production':
      return 5_000;
    case 'medium-volume':
      return 1_800;
    case 'small-batch':
      return 750;
    case 'prototype':
    default:
      return 300;
  }
}

/**
 * One-time hand-pack labor for a trial-mode batch.
 *
 * @param quantity - The trial-batch quantity.
 * @returns The labor cost in USD.
 */
function trialLaborFor(quantity: number): number {
  // Setup overhead plus per-unit packing. Floor at $100 for
  // tiny batches so the receipt doesn't look implausibly cheap.
  return Math.max(100, 60 + quantity * 8);
}

/**
 * Trial-mode turnaround estimate.
 *
 * @param quantity - The trial-batch quantity.
 * @returns A short human-readable string.
 */
function trialLeadDaysFor(quantity: number): string {
  if (quantity <= 25) {
    return '2 business days';
  }
  if (quantity <= 100) {
    return '3 business days';
  }
  return '5 business days';
}

/**
 * Per-unit monthly storage cost for production-mode storefront
 * fulfillment. Drops with volume as the operator's pallet
 * utilization improves.
 *
 * @param tier - Volume tier.
 * @returns USD per unit per month.
 */
function storagePerUnitFor(tier: VolumeTierProfile['tier']): number {
  switch (tier) {
    case 'production':
      return 0.32;
    case 'medium-volume':
      return 0.4;
    case 'small-batch':
      return 0.48;
    case 'prototype':
    default:
      return 0.55;
  }
}

/**
 * Per-order pick-and-pack labor cost for production-mode storefront
 * fulfillment. Drops with volume as the operator's ops scale.
 *
 * @param tier - Volume tier.
 * @returns USD per order.
 */
function pickPackPerOrderFor(tier: VolumeTierProfile['tier']): number {
  switch (tier) {
    case 'production':
      return 1.85;
    case 'medium-volume':
      return 2.1;
    case 'small-batch':
      return 2.4;
    case 'prototype':
    default:
      return 2.65;
  }
}

/**
 * Minimum monthly invoice (storage floor) for production mode. Set
 * so the operator covers fixed overhead during early ramp.
 *
 * @param tier - Volume tier.
 * @returns USD per month.
 */
function firstMonthFloorFor(tier: VolumeTierProfile['tier']): number {
  switch (tier) {
    case 'production':
      return 850;
    case 'medium-volume':
      return 350;
    case 'small-batch':
      return 150;
    case 'prototype':
    default:
      return 95;
  }
}

/**
 * Integration lead time for production-mode storefront fulfillment.
 *
 * @param tier - Volume tier.
 * @returns A short human-readable string.
 */
function integrationLeadDaysFor(tier: VolumeTierProfile['tier']): string {
  switch (tier) {
    case 'production':
      return '4 weeks';
    case 'medium-volume':
      return '2 weeks';
    case 'small-batch':
      return '7 business days';
    case 'prototype':
    default:
      return '5 business days';
  }
}
