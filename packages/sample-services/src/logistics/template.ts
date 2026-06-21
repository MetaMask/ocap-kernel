/**
 * Token substitution for the logistics-fulfillment markdown.
 */

import { MASTER_MD } from './master-md.ts';

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
};

/**
 * Render the master fulfillment-plan markdown with `{{...}}` tokens
 * filled in.
 *
 * @param inputs - Caller-supplied inputs (provider identity for now).
 * @returns The rendered markdown.
 */
export function renderFulfillmentPlan(inputs: TemplateInputs): string {
  const warehouse = pickOne(WAREHOUSE_PROFILES);
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
  };
  return MASTER_MD.replace(/\{\{(\w+)\}\}/gu, (match, name: string) =>
    name in tokens ? (tokens[name] as string) : match,
  );
}
