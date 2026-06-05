/**
 * Token substitution + bounded randomness for the schematic-generation
 * artifact template. Same pattern as the industrial-design template:
 * crypto.getRandomValues for choices, resolved at call time.
 */

import { MASTER_SVG } from './master-svg.ts';

/* eslint-disable n/no-unsupported-features/node-builtins -- crypto
   reaches us via the vat's `crypto` endowment (cluster config
   `globals: ['crypto']`); the lint rule misreads it as the
   experimental Node 22 global. */

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

const REV_LETTERS = ['A', 'B', 'C', 'D'] as const;
const REV_DIGITS = ['1', '2', '3', '4'] as const;
const MCU_PART_NUMBERS = ['ESP32-S3-MINI-N8', 'RP2040', 'nRF52840'] as const;
const LDO_PART_NUMBERS = ['TPS61221', 'MIC5219-3.3', 'MAX17222'] as const;

/* eslint-enable n/no-unsupported-features/node-builtins */

/**
 * Pick a random element from a non-empty array; falls back to the
 * first if crypto is unreachable.
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

/**
 * Today's date in YYYY-MM-DD form (UTC).
 *
 * @returns The formatted date.
 */
function today(): string {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export type TemplateInputs = {
  providerLabel: string;
};

/**
 * Render the master schematic SVG with `{{...}}` tokens filled in.
 *
 * @param inputs - Provider-supplied inputs not randomized per-call.
 * @returns The rendered SVG as a string.
 */
export function renderSchematic(inputs: TemplateInputs): string {
  const tokens: Record<string, string> = {
    revLabel: `${pickOne(REV_LETTERS)}${pickOne(REV_DIGITS)}`,
    providerLabel: inputs.providerLabel,
    schDate: today(),
    mcuPartNumber: pickOne(MCU_PART_NUMBERS),
    ldoPartNumber: pickOne(LDO_PART_NUMBERS),
  };
  return MASTER_SVG.replace(/\{\{(\w+)\}\}/gu, (match, name: string) =>
    name in tokens ? (tokens[name] as string) : match,
  );
}
