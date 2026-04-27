import type { EvaluatedSection, Lift, LiftContext } from './types.ts';

/**
 * A lift that yields all germs in their original order without filtering.
 *
 * Use as a placeholder when the sheaf always has a single-section stalk
 * (the lift is never actually called) or to express "try everything in
 * declaration order" as an explicit policy.
 *
 * @param germs - Evaluated sections to yield in order.
 * @yields Each germ in the original array order.
 */
export async function* noopLift<M extends Record<string, unknown>>(
  germs: EvaluatedSection<Partial<M>>[],
): AsyncGenerator<EvaluatedSection<Partial<M>>, void, unknown[]> {
  yield* germs;
}

/**
 * Proxy a lift coroutine, forwarding yielded candidates up and received
 * error arrays down to the inner generator.
 *
 * Note: async generator `yield*` DOES forward `.next(value)` to the
 * delegated async iterator, so for simple sequential composition (e.g.
 * `fallthrough`) you can use `yield*` directly. `proxyLift` is the right
 * primitive when you need to add logic between yields — for example,
 * logging, counting attempts, or conditionally stopping early based on the
 * error history.
 *
 * @param gen - The inner async generator to proxy.
 * @yields Candidates from the inner generator.
 * @returns void when the inner generator is exhausted.
 * @example
 * // Lift that logs each retry
 * const withLogging = <M>(inner: Lift<M>): Lift<M> =>
 *   async function*(germs, context) {
 *     const gen = inner(germs, context);
 *     let next = await gen.next([]);
 *     while (!next.done) {
 *       const errors: unknown[] = yield next.value;
 *       if (errors.length > 0) console.log(`retry #${errors.length}`);
 *       next = await gen.next(errors);
 *     }
 *   };
 * // The above pattern is exactly proxyLift with a side-effect added.
 */
export async function* proxyLift<M extends Record<string, unknown>>(
  gen: AsyncGenerator<EvaluatedSection<Partial<M>>, void, unknown[]>,
): AsyncGenerator<EvaluatedSection<Partial<M>>, void, unknown[]> {
  let next = await gen.next([]);
  while (!next.done) {
    const errors: unknown[] = yield next.value;
    next = await gen.next(errors);
  }
}

/**
 * Filter germs before passing to a lift.
 *
 * Returns the inner lift's generator directly — no proxying needed since
 * this is a pure input transform that delegates entirely to the inner lift.
 *
 * @param predicate - Returns true for germs that should be passed to the inner lift.
 * @returns A lift combinator that filters its germs before delegating.
 */
export const withFilter =
  <M extends Record<string, unknown>>(
    predicate: (
      germ: EvaluatedSection<Partial<M>>,
      ctx: LiftContext<M>,
    ) => boolean,
  ) =>
  (inner: Lift<M>): Lift<M> =>
  (germs, context) =>
    inner(
      germs.filter((germ) => predicate(germ, context)),
      context,
    );

/**
 * Sort germs by a comparator before passing to a lift.
 *
 * Returns the inner lift's generator directly — no proxying needed since
 * this is a pure input transform that delegates entirely to the inner lift.
 * The original germs array is not mutated.
 *
 * @param comparator - Comparator function for sorting (same signature as Array.sort).
 * @returns A lift combinator that sorts its germs before delegating.
 */
export const withRanking =
  <M extends Record<string, unknown>>(
    comparator: (
      a: EvaluatedSection<Partial<M>>,
      b: EvaluatedSection<Partial<M>>,
    ) => number,
  ) =>
  (inner: Lift<M>): Lift<M> =>
  (germs, context) =>
    inner([...germs].sort(comparator), context);

/**
 * Try all candidates from liftA, then all candidates from liftB.
 *
 * Uses `yield*` directly since async generator delegation forwards
 * `.next(value)` to the inner iterator, so error arrays are correctly
 * threaded through each inner lift.
 *
 * liftB is not informed of liftA's failures at its prime call, but via
 * `yield*` it receives all accumulated errors (including liftA's) as the
 * argument to each subsequent `next(errors)` after its own failed attempts.
 *
 * @param liftA - First lift; its candidates are tried before liftB's.
 * @param liftB - Fallback lift; only invoked after liftA is exhausted.
 * @returns A combined lift that sequences liftA then liftB.
 */
export const fallthrough = <M extends Record<string, unknown>>(
  liftA: Lift<M>,
  liftB: Lift<M>,
): Lift<M> =>
  async function* (germs, context) {
    yield* liftA(germs, context);
    yield* liftB(germs, context);
  };
