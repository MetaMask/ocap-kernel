/**
 * Token substitution for the device-assembly build plan.
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

const BATCH_PROFILES = [
  { batchSize: '10 units', unitCost: '$18', batchTotal: '$180' },
  { batchSize: '15 units', unitCost: '$16', batchTotal: '$240' },
  { batchSize: '20 units', unitCost: '$14', batchTotal: '$280' },
] as const;
const LEAD_DAYS = ['2 weeks', '3 weeks', '4 weeks'] as const;
const QA_RATES = ['92%', '94%', '96%'] as const;

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
 * Render the master build-plan markdown with `{{...}}` tokens filled
 * in.
 *
 * @param inputs - Caller-supplied inputs (provider identity for now).
 * @returns The rendered markdown.
 */
export function renderBuildPlan(inputs: TemplateInputs): string {
  const profile = pickOne(BATCH_PROFILES);
  const tokens: Record<string, string> = {
    providerLabel: inputs.providerLabel,
    batchSize: profile.batchSize,
    unitCost: profile.unitCost,
    batchTotal: profile.batchTotal,
    leadDays: pickOne(LEAD_DAYS),
    qaPassRate: pickOne(QA_RATES),
  };
  return MASTER_MD.replace(/\{\{(\w+)\}\}/gu, (match, name: string) =>
    name in tokens ? (tokens[name] as string) : match,
  );
}
