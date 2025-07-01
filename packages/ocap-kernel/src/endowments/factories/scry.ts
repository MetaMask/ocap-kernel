import type { VRef } from '../../types.ts';
import type { EndowmentContext } from '../types.ts';

/**
 * A function that scries a vref.
 */
export type Scry = (vref: VRef) => unknown;

/**
 * Make a function that scries a vref. It logs to the console, which in
 * production is a no-op. In development, it can be used to inspect the
 * contents of a vref.
 *
 * @param context - The context in which the endowment is created.
 * @returns A function that scries a vref.
 */
export function factory(context: EndowmentContext): Scry {
  const { toRef } = context;
  const scry: Scry = (object: unknown) => console.log(`scry ${toRef(object)}`);
  return harden(scry);
}
