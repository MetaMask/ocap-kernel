/**
 * Token substitution + bounded randomness for the industrial-design
 * concept-sketch template. The SES vat compartment has no
 * `Math.random` (lockdown removes it), so each randomized choice
 * pulls one byte from `crypto.getRandomValues` (a vat endowment) and
 * indexes into a small list of plausible values.
 *
 * Per plan §7.5 the randomness is bounded: every choice is from a
 * pre-vetted list, so the rendered SVG can vary subtly between runs
 * without producing anything broken.
 */

import { MASTER_SVG } from './master-svg.ts';

/* eslint-disable n/no-unsupported-features/node-builtins -- the
   crypto global is "experimental" pre-Node-23 by ESLint's
   Node-builtins rule, but we reach it via the vat's `crypto`
   endowment (cluster config `globals: ['crypto']`), which is the
   same shape on every supported platform. */

type CryptoSource = {
  getRandomValues: (array: Uint8Array) => Uint8Array;
};

/**
 * Resolve the crypto endowment at call time rather than at module
 * load. Same pattern as `vat-lib/registration-token.ts`: defer to the
 * call site so re-bindings or late-init endowments still work.
 *
 * @returns The crypto endowment, or `undefined` if unavailable.
 */
function resolveCrypto(): CryptoSource | undefined {
  const bare: unknown = typeof crypto === 'undefined' ? undefined : crypto;
  return (bare ?? (globalThis as { crypto?: unknown }).crypto) as
    | CryptoSource
    | undefined;
}

const IR_PROTOCOL_SETS = [
  'NEC + RC-5 + Sony',
  'NEC + RC-6 + Sony',
  'NEC + RC-5 + Samsung',
  'NEC + Sony + Pronto',
] as const;
const BATTERY_LIFE_MONTHS = ['18 mo', '24 mo', '30 mo', '36 mo'] as const;

/**
 * Pick a random element from a non-empty array. Falls back to the
 * first element if the crypto source is missing (which would be a
 * cluster-config bug, but the artifact still renders).
 *
 * @param options - Choices to pick from.
 * @returns One of the elements.
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
 * Generate a clock-face string in `HH:MM` form (24-hour).
 *
 * @returns A formatted time string.
 */
function pickScreenTime(): string {
  const source = resolveCrypto();
  if (!source?.getRandomValues) {
    return '20:34';
  }
  const bytes = new Uint8Array(2);
  source.getRandomValues(bytes);
  const hour = String((bytes[0] as number) % 24).padStart(2, '0');
  const minute = String((bytes[1] as number) % 60).padStart(2, '0');
  return `${hour}:${minute}`;
}

/* eslint-enable n/no-unsupported-features/node-builtins */

export type TemplateInputs = {
  providerLabel: string;
  revLabel: string;
};

/**
 * Render the master SVG with all `{{...}}` tokens filled in.
 *
 * @param inputs - Caller-supplied inputs not randomized per-call:
 *   provider identity and the revision label (the service computes
 *   the latter so consecutive calls produce coherent A1/A2/A3).
 * @returns The rendered SVG as a string.
 */
export function renderConceptSketch(inputs: TemplateInputs): string {
  const tokens: Record<string, string> = {
    revLabel: inputs.revLabel,
    providerLabel: inputs.providerLabel,
    screenTime: pickScreenTime(),
    batteryLifeMonths: pickOne(BATTERY_LIFE_MONTHS),
    irProtocols: pickOne(IR_PROTOCOL_SETS),
  };
  return MASTER_SVG.replace(/\{\{(\w+)\}\}/gu, (match, name: string) =>
    name in tokens ? (tokens[name] as string) : match,
  );
}
