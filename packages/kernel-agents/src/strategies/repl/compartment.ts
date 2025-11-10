import 'ses';
// Assigns Compartment to globalThis.
export type Compartment = { evaluate: (code: string) => unknown };
export const makeCompartment = (
  endowments: Record<string, unknown> = {},
): Compartment => new Compartment(endowments);
