/**
 * Token substitution for the logistics-fulfillment markdown. The
 * renderer picks the production or trial-distribution template based
 * on the `mode` flag the service derives from the brief.
 */

import { MASTER_MD_PRODUCTION, MASTER_MD_TRIAL } from './master-md.ts';

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
const PICK_PACK_RATES = ['$2.10', '$2.40', '$2.65'] as const;
const STORAGE_RATES = ['$0.40', '$0.45', '$0.55'] as const;
const CUT_OFF_TIMES = ['2 PM local', '3 PM local', '4 PM local'] as const;
const LEAD_DAYS = [
  '3 business days',
  '5 business days',
  '7 business days',
] as const;

const TRIAL_BATCH_SIZES = ['10 units', '15 units', '20 units'] as const;
const TRIAL_PACK_LABOR = ['$100', '$120', '$140'] as const;
const TRIAL_SHIP_FLAT = ['$7.50', '$8.80', '$9.50'] as const;
const TRIAL_LEAD_DAYS = [
  '2 business days',
  '3 business days',
  '5 business days',
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
};

/**
 * Render the appropriate fulfillment-plan markdown with `{{...}}`
 * tokens filled in, picking the production or trial variant per the
 * caller's `mode`.
 *
 * @param inputs - Caller-supplied inputs.
 * @returns The rendered markdown.
 */
export function renderFulfillmentPlan(inputs: TemplateInputs): string {
  const warehouse = pickOne(WAREHOUSE_PROFILES);
  const template =
    inputs.mode === 'trial' ? MASTER_MD_TRIAL : MASTER_MD_PRODUCTION;
  const tokens: Record<string, string> = {
    providerLabel: inputs.providerLabel,
    warehouseRegion: warehouse.warehouseRegion,
    warehouseCity: warehouse.warehouseCity,
    storagePerUnit: pickOne(STORAGE_RATES),
    pickPackPerOrder: pickOne(PICK_PACK_RATES),
    insertCost: '$0.35',
    groundZone1to4: '$6.80',
    groundZone5to8: '$8.40',
    intlRate: '$24.00',
    returnRate: '$3.90',
    firstMonthFloor: '$95',
    cutOffTime: pickOne(CUT_OFF_TIMES),
    leadDays: pickOne(LEAD_DAYS),
    unitCount: pickOne(TRIAL_BATCH_SIZES),
    trialPackLabor: pickOne(TRIAL_PACK_LABOR),
    trialShipFlat: pickOne(TRIAL_SHIP_FLAT),
    trialLeadDays: pickOne(TRIAL_LEAD_DAYS),
  };
  return template.replace(/\{\{(\w+)\}\}/gu, (match, name: string) =>
    name in tokens ? (tokens[name] as string) : match,
  );
}
