/**
 * Token substitution + bounded randomness for the pcb-layout
 * top-view artifact. Picks a board color + size as independent
 * per-call choices, plus a rev label.
 */

import { MASTER_SVG } from './master-svg.ts';

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

const BOARD_COLORS = [
  '#0d6e3a', // green
  '#1c1c1c', // black
  '#1c4a8e', // blue
  '#7a0e2e', // red
] as const;

const BOARD_SIZES = ['46 × 102 mm', '52 × 110 mm', '58 × 118 mm'] as const;

const REV_LETTERS = ['A', 'B', 'C', 'D'] as const;
const REV_DIGITS = ['1', '2', '3', '4'] as const;

/* eslint-enable n/no-unsupported-features/node-builtins */

/**
 * Pick one element from a non-empty array.
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
 * Render the master pcb-layout SVG with `{{...}}` tokens filled in.
 *
 * @param inputs - Provider-supplied inputs not randomized per-call.
 * @returns The rendered SVG as a string.
 */
export function renderPcbLayout(inputs: TemplateInputs): string {
  const tokens: Record<string, string> = {
    revLabel: `${pickOne(REV_LETTERS)}${pickOne(REV_DIGITS)}`,
    providerLabel: inputs.providerLabel,
    boardColor: pickOne(BOARD_COLORS),
    boardSize: pickOne(BOARD_SIZES),
  };
  return MASTER_SVG.replace(/\{\{(\w+)\}\}/gu, (match, name: string) =>
    name in tokens ? (tokens[name] as string) : match,
  );
}
