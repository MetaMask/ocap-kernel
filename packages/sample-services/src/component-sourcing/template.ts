/**
 * Token substitution for the component-sourcing BOM. Same crypto
 * endowment pattern as the other service templates.
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
  { batchSize: '10 units', unitTotal: '$67.40', batchTotal: '$674.00' },
  { batchSize: '15 units', unitTotal: '$64.10', batchTotal: '$961.50' },
  { batchSize: '20 units', unitTotal: '$61.85', batchTotal: '$1,237.00' },
] as const;
const LEAD_DAYS = ['14 days', '18 days', '21 days'] as const;

/**
 * MCU is locked to ESP32-S3-MINI-N8 so the schematic, firmware,
 * component-sourcing, and pcb-layout dummy services all agree (see
 * the matching note in schematic-generation/template.ts).
 */
const MCU_PART = 'ESP32-S3-MINI-N8';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for record of alternative MCUs
const ALTERNATE_MCU_PARTS = ['nRF52833-QIAA', 'nRF52840-QIAA'] as const;

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
 * Render the master BOM markdown with `{{...}}` tokens filled in.
 *
 * @param inputs - Caller-supplied inputs (provider identity for now).
 * @returns The rendered markdown.
 */
export function renderBom(inputs: TemplateInputs): string {
  const profile = pickOne(BATCH_PROFILES);
  const tokens: Record<string, string> = {
    providerLabel: inputs.providerLabel,
    batchSize: profile.batchSize,
    unitTotal: profile.unitTotal,
    batchTotal: profile.batchTotal,
    leadDays: pickOne(LEAD_DAYS),
    mcuPart: MCU_PART,
  };
  return MASTER_MD.replace(/\{\{(\w+)\}\}/gu, (match, name: string) =>
    name in tokens ? (tokens[name] as string) : match,
  );
}
