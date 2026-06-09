import type { Candidate, Policy, PolicyContext } from './types.ts';

/**
 * A policy that yields all candidates in their original order without filtering.
 *
 * Use as a placeholder when the sheaf always resolves to a single candidate
 * (the policy is never actually called) or to express "try everything in
 * declaration order" as an explicit policy.
 *
 * @param candidates - Candidates to yield in order.
 * @yields Each candidate in the original array order.
 */
export async function* noopPolicy<M extends Record<string, unknown>>(
  candidates: Candidate<Partial<M>>[],
): AsyncGenerator<Candidate<Partial<M>>, void, unknown[]> {
  yield* candidates;
}

/**
 * Proxy a policy coroutine, forwarding yielded candidates up and received
 * error arrays down to the inner generator.
 *
 * Note: async generator `yield*` DOES forward `.next(value)` to the
 * delegated async iterator, so for simple sequential composition (e.g.
 * `fallthrough`) you can use `yield*` directly. `proxyPolicy` is the right
 * primitive when you need to add logic between yields — for example,
 * logging, counting attempts, or conditionally stopping early based on the
 * error history.
 *
 * @param gen - The inner async generator to proxy.
 * @yields Candidates from the inner generator.
 * @returns void when the inner generator is exhausted.
 * @example
 * // Policy that logs each retry
 * const withLogging = <M>(inner: Policy<M>): Policy<M> =>
 *   async function*(candidates, context) {
 *     const gen = inner(candidates, context);
 *     let next = await gen.next([]);
 *     while (!next.done) {
 *       const errors: unknown[] = yield next.value;
 *       if (errors.length > 0) console.log(`retry #${errors.length}`);
 *       next = await gen.next(errors);
 *     }
 *   };
 * // The above pattern is exactly proxyPolicy with a side-effect added.
 */
export async function* proxyPolicy<M extends Record<string, unknown>>(
  gen: AsyncGenerator<Candidate<Partial<M>>, void, unknown[]>,
): AsyncGenerator<Candidate<Partial<M>>, void, unknown[]> {
  let next = await gen.next([]);
  while (!next.done) {
    const errors: unknown[] = yield next.value;
    next = await gen.next(errors);
  }
}

/**
 * Filter candidates before passing to a policy.
 *
 * Returns the inner policy's generator directly — no proxying needed since
 * this is a pure input transform that delegates entirely to the inner policy.
 *
 * @param predicate - Returns true for candidates that should be passed to the inner policy.
 * @returns A policy combinator that filters its candidates before delegating.
 */
export const withFilter =
  <M extends Record<string, unknown>>(
    predicate: (
      candidate: Candidate<Partial<M>>,
      ctx: PolicyContext<M>,
    ) => boolean,
  ) =>
  (inner: Policy<M>): Policy<M> =>
  (candidates, context) =>
    inner(
      candidates.filter((candidate) => predicate(candidate, context)),
      context,
    );

/**
 * Sort candidates by a comparator before passing to a policy.
 *
 * Returns the inner policy's generator directly — no proxying needed since
 * this is a pure input transform that delegates entirely to the inner policy.
 * The original candidates array is not mutated.
 *
 * @param comparator - Comparator function for sorting (same signature as Array.sort).
 * @returns A policy combinator that sorts its candidates before delegating.
 */
export const withRanking =
  <M extends Record<string, unknown>>(
    comparator: (a: Candidate<Partial<M>>, b: Candidate<Partial<M>>) => number,
  ) =>
  (inner: Policy<M>): Policy<M> =>
  (candidates, context) =>
    inner([...candidates].sort(comparator), context);

/**
 * Try all candidates from policyA, then all candidates from policyB.
 *
 * Uses `yield*` directly since async generator delegation forwards
 * `.next(value)` to the inner iterator, so error arrays are correctly
 * threaded through each inner policy.
 *
 * policyB is not informed of policyA's failures at its prime call, but via
 * `yield*` it receives all accumulated errors (including policyA's) as the
 * argument to each subsequent `next(errors)` after its own failed attempts.
 *
 * @param policyA - First policy; its candidates are tried before policyB's.
 * @param policyB - Fallback policy; only invoked after policyA is exhausted.
 * @returns A combined policy that sequences policyA then policyB.
 */
export const fallthrough = <M extends Record<string, unknown>>(
  policyA: Policy<M>,
  policyB: Policy<M>,
): Policy<M> =>
  async function* (candidates, context) {
    yield* policyA(candidates, context);
    yield* policyB(candidates, context);
  };
