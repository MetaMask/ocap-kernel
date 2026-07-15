/**
 * Token substitution + bounded randomness for the firmware service's
 * two artifacts: the markdown specification (rendered by
 * `renderFirmwareSpec`) and the C source-code implementation
 * (rendered by `renderFirmwareImplementation`). Same
 * `crypto.getRandomValues` pattern as the other service-vat templates.
 */

import { MASTER_C } from './master-c.ts';
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
 * MCU is locked to ESP32-S3-MINI-N8 so the schematic, firmware,
 * component-sourcing, and pcb-layout dummy services all agree (see
 * the matching note in schematic-generation/template.ts). The IR GPIO
 * macro emitted into the source mirrors the GPIO label in the
 * spec — they need to refer to the same pin.
 */
const MCU_CHOICE = {
  mcu: 'ESP32-S3-MINI-N8',
  irGpioLabel: 'GPIO 4',
  irGpioMacro: 'GPIO_NUM_4',
} as const;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for record of alternative MCUs
const ALTERNATE_MCU_OPTIONS = [
  { mcu: 'RP2040', irGpioLabel: 'GP15', irGpioMacro: 'GP15' },
  {
    mcu: 'nRF52840',
    irGpioLabel: 'P0.13',
    irGpioMacro: 'NRF_GPIO_PIN_MAP(0,13)',
  },
] as const;

const DEBOUNCE_MS = ['10', '20', '30'] as const;
const IDLE_TIMEOUT_SEC = ['30', '60', '120'] as const;
const REV_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
const REV_DIGITS = ['1', '2', '3', '4'] as const;
const HEX_CHARS = '0123456789abcdef';

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
 * Generate a 7-char hex build-id stamp. Falls back to a fixed value
 * when crypto is unreachable so the artifact still renders.
 *
 * @returns The hex stamp.
 */
function makeBuildHash(): string {
  const source = resolveCrypto();
  if (!source?.getRandomValues) {
    return '0000000';
  }
  const bytes = new Uint8Array(4);
  source.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) {
    out +=
      (HEX_CHARS[Math.floor(byte / 16)] as string) +
      (HEX_CHARS[byte % 16] as string);
  }
  return out.slice(0, 7);
}

/**
 * Render the master firmware-specification markdown with `{{...}}` tokens
 * filled in. MCU and IR GPIO are chosen as a unit (the GPIO label
 * varies by MCU); debounce and idle-timeout are independent.
 *
 * @returns The rendered markdown as a string.
 */
export function renderFirmwareSpec(): string {
  const tokens: Record<string, string> = {
    mcu: MCU_CHOICE.mcu,
    irGpio: MCU_CHOICE.irGpioLabel,
    debounceMs: pickOne(DEBOUNCE_MS),
    idleTimeoutSec: pickOne(IDLE_TIMEOUT_SEC),
  };
  return MASTER_MD.replace(/\{\{(\w+)\}\}/gu, (match, name: string) =>
    name in tokens ? (tokens[name] as string) : match,
  );
}

/**
 * Inputs to the firmware-implementation render. `changes` is the
 * inventor's natural-language conditional-approval text; when
 * non-empty, it's woven into the source header as documentation of
 * what the implementor agreed to incorporate.
 */
export type FirmwareImplementationInputs = {
  changes?: string;
};

const REV_NUM_PATTERN = /(\d+)$/u;
const REV_NUM_MAX = 9;

/**
 * Bump a "Letter+Digit" rev label by one digit (E1 → E2, E2 → E3, ...).
 * Once the digit hits the end of the bank, advance the letter and reset
 * the digit. The implementation artifact takes the next rev after the
 * spec it implements.
 *
 * @param specRev - Rev label of the spec being implemented.
 * @returns The implementation rev label.
 */
function nextRev(specRev: string): string {
  const match = REV_NUM_PATTERN.exec(specRev);
  if (!match) {
    return specRev;
  }
  const digit = Number.parseInt(match[1] as string, 10);
  if (digit < REV_NUM_MAX) {
    return specRev.slice(0, -1) + String(digit + 1);
  }
  return specRev;
}

/**
 * Render the C source artifact for the firmware implementation. Picks
 * fresh per-call values for the build hash, debounce, and idle
 * timeout — the implementation rev label takes a step past the spec
 * rev so the two are clearly different artifacts.
 *
 * @param inputs - Optional inventor-supplied conditional-approval
 *   changes to weave into the header comment.
 * @param specRev - The rev label of the spec being implemented, so the
 *   implementation rev label can step forward from it. Defaults to a
 *   freshly-picked rev when not supplied (e.g. preview rendering).
 * @returns The rendered C source as a string.
 */
export function renderFirmwareImplementation(
  inputs: FirmwareImplementationInputs = {},
  specRev?: string,
): string {
  const baseRev = specRev ?? `${pickOne(REV_LETTERS)}${pickOne(REV_DIGITS)}`;
  const implRev = nextRev(baseRev);
  const trimmedChanges = inputs.changes?.trim() ?? '';
  const changesBlock =
    trimmedChanges.length > 0
      ? `\n *\n * Inventor-requested changes incorporated:\n${trimmedChanges
          .split(/\r?\n/u)
          .map((line) => ` *   ${line.length > 0 ? line : ''}`.trimEnd())
          .join('\n')}`
      : '';
  const tokens: Record<string, string> = {
    rev: implRev,
    mcu: MCU_CHOICE.mcu,
    irGpio: MCU_CHOICE.irGpioMacro,
    buildHash: makeBuildHash(),
    debounceMs: pickOne(DEBOUNCE_MS),
    idleTimeoutMs: String(
      Number.parseInt(pickOne(IDLE_TIMEOUT_SEC), 10) * 1000,
    ),
    changesIncorporated: changesBlock,
  };
  return MASTER_C.replace(/\{\{(\w+)\}\}/gu, (match, name: string) =>
    name in tokens ? (tokens[name] as string) : match,
  );
}
