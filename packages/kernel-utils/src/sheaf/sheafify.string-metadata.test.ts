// This test verifies that source-kind metadata specs are compiled via a
// compartment at sheafify construction time and evaluated at dispatch time.
//
// We use a new Function()-based compartment rather than a real SES Compartment
// because importing 'ses' alongside '@endo/exo' triggers a module-evaluation
// ordering conflict in the test environment: @endo/patterns module initialization
// calls assertPattern() under SES lockdown before its internal objects are frozen.
// That conflict is an environment limitation, not a feature limitation.
//
// The functional properties under test are identical regardless of which
// Compartment implementation compiles the source string.

import { M } from '@endo/patterns';
import { describe, it, expect, vi } from 'vitest';

import { source } from './metadata.ts';
import { makeSection } from './section.ts';
import { sheafify } from './sheafify.ts';
import type { Lift, PresheafSection } from './types.ts';

// Thin cast for calling exo methods directly in tests without going through
// HandledPromise (which is not available in the test environment).
// eslint-disable-next-line id-length
const E = (obj: unknown) =>
  obj as Record<string, (...args: unknown[]) => Promise<unknown>>;

// A Compartment-shaped object that actually evaluates JS source strings.
/* eslint-disable @typescript-eslint/no-implied-eval, no-new-func */
const makeTestCompartment = () => ({
  evaluate: (src: string) => new Function(`return (${src})`)(),
});
/* eslint-enable @typescript-eslint/no-implied-eval, no-new-func */

describe('e2e: source metadata — compartment evaluates cost function', () => {
  // Same two-swap scenario as the callable e2e test, but cost functions are
  // provided as JS source strings and compiled via the test compartment.
  // Breakeven ≈ 90.9 (same arithmetic as callable variant).

  type SwapCost = { cost: number };

  const cheapest: Lift<SwapCost> = async function* (germs) {
    yield* [...germs].sort(
      (a, b) => (a.metadata?.cost ?? Infinity) - (b.metadata?.cost ?? Infinity),
    );
  };

  it('routes swap(50) to A and swap(100) to B using source-kind metadata', async () => {
    const swapAFn = vi.fn(
      (_amount: number, _from: string, _to: string): boolean => true,
    );
    const swapBFn = vi.fn(
      (_amount: number, _from: string, _to: string): boolean => true,
    );

    const sections: PresheafSection<SwapCost>[] = [
      {
        exo: makeSection(
          'SwapA',
          M.interface('SwapA', {
            swap: M.call(M.number(), M.string(), M.string()).returns(
              M.boolean(),
            ),
          }),
          { swap: swapAFn },
        ),
        // cost(amount) = 1 + 0.1 * amount
        metadata: source(`(args) => ({ cost: 1 + 0.1 * args[0] })`),
      },
      {
        exo: makeSection(
          'SwapB',
          M.interface('SwapB', {
            swap: M.call(M.number(), M.string(), M.string()).returns(
              M.boolean(),
            ),
          }),
          { swap: swapBFn },
        ),
        // cost(amount) = 10 + 0.001 * amount
        metadata: source(`(args) => ({ cost: 10 + 0.001 * args[0] })`),
      },
    ];

    const facade = sheafify({
      name: 'Swap',
      sections,
      compartment: makeTestCompartment(),
    }).getGlobalSection({ lift: cheapest }) as unknown as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;

    // swap(50): A costs 6, B costs 10.05 → A wins
    await E(facade).swap(50, 'FUZ', 'BIZ');
    expect(swapAFn).toHaveBeenCalledWith(50, 'FUZ', 'BIZ');
    expect(swapBFn).not.toHaveBeenCalled();
    swapAFn.mockClear();

    // swap(100): A costs 11, B costs 10.1 → B wins
    await E(facade).swap(100, 'FUZ', 'BIZ');
    expect(swapBFn).toHaveBeenCalledWith(100, 'FUZ', 'BIZ');
    expect(swapAFn).not.toHaveBeenCalled();
  });
});
