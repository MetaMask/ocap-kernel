/**
 * Token substitution + bounded randomness for the firmware-spec
 * markdown artifact. Same crypto.getRandomValues pattern as the
 * other service-vat templates.
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

/**
 * MCU is locked to ESP32-S3-MINI-N8 so the schematic, firmware-spec,
 * component-sourcing, and pcb-layout dummy services all agree (see
 * the matching note in schematic-generation/template.ts).
 */
const MCU_CHOICE = { mcu: 'ESP32-S3-MINI-N8', irGpio: 'GPIO 4' } as const;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for record of alternative MCUs
const ALTERNATE_MCU_OPTIONS = [
  { mcu: 'RP2040', irGpio: 'GP15' },
  { mcu: 'nRF52840', irGpio: 'P0.13' },
] as const;

const DEBOUNCE_MS = ['10', '20', '30'] as const;
const IDLE_TIMEOUT_SEC = ['30', '60', '120'] as const;

/* eslint-enable n/no-unsupported-features/node-builtins */

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

/**
 * Render the master firmware-spec markdown with `{{...}}` tokens
 * filled in. MCU and IR GPIO are chosen as a unit (the GPIO label
 * varies by MCU); debounce and idle-timeout are independent.
 *
 * @returns The rendered markdown as a string.
 */
export function renderFirmwareSpec(): string {
  const tokens: Record<string, string> = {
    mcu: MCU_CHOICE.mcu,
    irGpio: MCU_CHOICE.irGpio,
    debounceMs: pickOne(DEBOUNCE_MS),
    idleTimeoutSec: pickOne(IDLE_TIMEOUT_SEC),
  };
  return MASTER_MD.replace(/\{\{(\w+)\}\}/gu, (match, name: string) =>
    name in tokens ? (tokens[name] as string) : match,
  );
}
