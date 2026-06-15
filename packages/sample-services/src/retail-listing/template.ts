/**
 * Token substitution for the retail-listing markdown.
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

const PRICE_TIERS = [
  { tier: 'Standard', retailPrice: '$49.99' },
  { tier: 'Standard', retailPrice: '$54.99' },
  { tier: 'Premium', retailPrice: '$69.99' },
] as const;
const LEAD_DAYS = [
  '3 business days',
  '5 business days',
  '7 business days',
] as const;
const WARRANTIES = ['12 months', '18 months', '24 months'] as const;

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
 * Render the master retail-listing markdown with `{{...}}` tokens
 * filled in.
 *
 * @param inputs - Caller-supplied inputs (provider identity for now).
 * @returns The rendered markdown.
 */
export function renderListing(inputs: TemplateInputs): string {
  const priceChoice = pickOne(PRICE_TIERS);
  const tokens: Record<string, string> = {
    providerLabel: inputs.providerLabel,
    tier: priceChoice.tier,
    retailPrice: priceChoice.retailPrice,
    leadDays: pickOne(LEAD_DAYS),
    warrantyMonths: pickOne(WARRANTIES),
  };
  return MASTER_MD.replace(/\{\{(\w+)\}\}/gu, (match, name: string) =>
    name in tokens ? (tokens[name] as string) : match,
  );
}
