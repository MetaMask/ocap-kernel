/**
 * Token substitution for the bench-build bring-up notes. Mirrors the
 * pattern used by the other sample services.
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

const UNIT_PROFILES = [
  { unitCount: '1 unit' },
  { unitCount: '2 units' },
] as const;
const TURNAROUNDS = ['3 days', '5 days', '7 days'] as const;
const VOICE_LATENCY = ['38 ms', '42 ms', '46 ms'] as const;
const IR_RANGE = ['7.5 m', '8.0 m', '9.0 m'] as const;
const DEEP_SLEEP = ['18 µA', '21 µA', '24 µA'] as const;
const REVISIONS = [
  'No firmware change needed; the build behaved per spec.',
  'Tighten the keypress debounce window from 10 ms to 8 ms; a few ' +
    'rapid-fire double-presses got dropped during the matrix sweep.',
  'Bump the deep-sleep wake-pull-up to the strong-internal setting; ' +
    'the voice button took two attempts to wake from a cold idle on ' +
    'one of the units. Minor, but the 15-unit run shouldn’t inherit it.',
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
   * proto-pros' labor charge for the bench build (USD). Set from the
   * `BENCH_BUILD_LABOR_PRICE_USD` constant in service.ts so the
   * receipt and the invoiced amount stay in sync.
   */
  laborPriceUsd: number;
  /**
   * Pass-through cost of the parts proto-pros sources for the build
   * (USD). Set from `BENCH_BUILD_PARTS_PRICE_USD`.
   */
  partsPriceUsd: number;
};

/**
 * Render the master bring-up-notes markdown with `{{...}}` tokens
 * filled in.
 *
 * @param inputs - Caller-supplied inputs.
 * @returns The rendered markdown.
 */
export function renderBringUpNotes(inputs: TemplateInputs): string {
  const units = pickOne(UNIT_PROFILES);
  const labor = `$${inputs.laborPriceUsd.toFixed(2)}`;
  const parts = `$${inputs.partsPriceUsd.toFixed(2)}`;
  const total = `$${(inputs.laborPriceUsd + inputs.partsPriceUsd).toFixed(2)}`;
  const tokens: Record<string, string> = {
    providerLabel: inputs.providerLabel,
    unitCount: units.unitCount,
    laborCost: labor,
    partsCost: parts,
    invoiceTotal: total,
    turnaround: pickOne(TURNAROUNDS),
    voiceLatencyMs: pickOne(VOICE_LATENCY),
    irRange: pickOne(IR_RANGE),
    deepSleepUa: pickOne(DEEP_SLEEP),
    boundedRevision: pickOne(REVISIONS),
  };
  return MASTER_MD.replace(/\{\{(\w+)\}\}/gu, (match, name: string) =>
    name in tokens ? (tokens[name] as string) : match,
  );
}
