/**
 * Provision algebra — lockdown-free subpath.
 *
 * Exports only types and functions from types.ts / provision.ts, which have no
 * `@endo/promise-kit` dependency. Use this entry point from hook scripts and
 * other non-vat processes that must not run SES lockdown.
 */
export type {
  ArgPattern,
  InvocationPattern,
  ParsedInvocation,
  Provision,
} from './types.ts';
export type { PatternOrder } from './provision.ts';
export {
  isPathArg,
  pathInterval,
  trivialInterval,
  argInterval,
  argPatternDisplay,
  matchArg,
  matchPattern,
  matchProvision,
  argPatternLe,
  compareInvocationPatterns,
  compareProvisions,
  computeAuthority,
  invocationToProvision,
} from './provision.ts';
