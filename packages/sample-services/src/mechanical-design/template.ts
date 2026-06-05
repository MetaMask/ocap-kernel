/**
 * Token substitution + bounded randomness for the mechanical-design
 * hero render. Picks a colorway as a unit (name + 4 case colors)
 * plus a per-call rev label.
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

type Colorway = {
  name: string;
  highlight: string;
  main: string;
  shadow: string;
  deepShadow: string;
};

const COLORWAYS: readonly Colorway[] = [
  {
    name: 'matte black',
    highlight: '#2a2a2a',
    main: '#1d1d1d',
    shadow: '#0a0a0a',
    deepShadow: '#000000',
  },
  {
    name: 'soft white',
    highlight: '#f8f6f1',
    main: '#ecebe5',
    shadow: '#c4c2bc',
    deepShadow: '#9c9a93',
  },
  {
    name: 'smoke grey',
    highlight: '#4f5358',
    main: '#3c4047',
    shadow: '#202428',
    deepShadow: '#0d1014',
  },
];

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
 * Render the master mechanical-design SVG with `{{...}}` tokens
 * filled in.
 *
 * @param inputs - Provider-supplied inputs not randomized per-call.
 * @returns The rendered SVG as a string.
 */
export function renderMechanicalHero(inputs: TemplateInputs): string {
  const colorway = pickOne(COLORWAYS);
  const tokens: Record<string, string> = {
    revLabel: `${pickOne(REV_LETTERS)}${pickOne(REV_DIGITS)}`,
    providerLabel: inputs.providerLabel,
    colorwayName: colorway.name,
    caseColorHighlight: colorway.highlight,
    caseColorMain: colorway.main,
    caseColorShadow: colorway.shadow,
    caseColorDeepShadow: colorway.deepShadow,
  };
  return MASTER_SVG.replace(/\{\{(\w+)\}\}/gu, (match, name: string) =>
    name in tokens ? (tokens[name] as string) : match,
  );
}
