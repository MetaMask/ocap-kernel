import { buildCommonEndowments } from '@metamask/snaps-execution-environments/endowments';
import {
  enums,
  func,
  object,
  record,
  string,
  unknown,
} from '@metamask/superstruct';

/**
 * The names of host/Web API globals that vats may request as endowments.
 * These are NOT ECMAScript intrinsics and are therefore absent from SES
 * Compartments unless explicitly provided.
 *
 * JS intrinsics (e.g. `ArrayBuffer`, `BigInt`, `Intl`, typed arrays) are
 * already available in every Compartment and do not need to be endowed.
 * `Date` and `Math` are intrinsics too, but lockdown tames them — calling
 * `Date.now()` or `Math.random()` throws in secure mode unless a working
 * replacement is endowed.
 *
 * NOTE: adding `fetch`, `Request`, `Response`, `Headers`, or `console` here
 * will pull in a Snaps factory that requires runtime options (`notify` or
 * `sourceLabel`) and will throw when called without them. Integrating those
 * requires adjusting {@link createDefaultEndowments} to pass the right
 * options through — see ocap-kernel issue #936 for the network case.
 */
const ALLOWED_GLOBAL_NAMES = [
  // Attenuated timer factories — isolated per vat, with teardown for
  // cancelling pending callbacks on termination.
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',

  // Attenuated `Date` — each read adds up to 1 ms of random jitter and
  // the result is clamped to be monotonic non-decreasing, so precise
  // sub-millisecond timing cannot leak through `Date.now()`.
  'Date',

  // Attenuated `Math` — only `Math.random` differs from the tamed
  // intrinsic: it is replaced with a `crypto.getRandomValues`-sourced
  // implementation. This is NOT a cryptographically secure RNG per the
  // upstream NOTE in `snaps-execution-environments/math.ts` — it exists
  // to avoid timing side channels in the stock RNG, nothing more.
  'Math',

  // Attenuated Web Crypto.
  'crypto',
  'SubtleCrypto',

  // Plain hardened Web APIs (no attenuation).
  'TextEncoder',
  'TextDecoder',
  'URL',
  'URLSearchParams',
  'atob',
  'btoa',
  'AbortController',
  'AbortSignal',
] as const;

/**
 * A global name that vats may request as an endowment. Callers that accept
 * this type get typo-checking at compile time, and the {@link AllowedGlobalNameStruct}
 * enforces the same invariant at RPC boundaries.
 */
export type AllowedGlobalName = (typeof ALLOWED_GLOBAL_NAMES)[number];

export const AllowedGlobalNameStruct = enums(ALLOWED_GLOBAL_NAMES);

const ALLOWED_GLOBAL_NAMES_SET: ReadonlySet<string> = new Set(
  ALLOWED_GLOBAL_NAMES,
);

/**
 * The endowments produced for a single vat.
 *
 * - `globals`: a hardened record of endowments keyed by global name. Safe to
 *   spread into a Compartment's initial bindings.
 * - `teardown`: releases resources held by stateful factories (e.g. pending
 *   timers, open network connections). Callable multiple times — the factory
 *   contract (per `EndowmentFactoryResult` in `snaps-execution-environments`)
 *   requires teardown to leave endowments reusable rather than broken, so
 *   repeated invocations are safe even though individual factories may
 *   perform no-op work after the first call.
 */
export type VatEndowments = {
  globals: Record<string, unknown>;
  teardown: () => Promise<void>;
};

/**
 * Shape-only validator used to guard the `VatSupervisor` boundary against
 * custom `MakeAllowedGlobals` factories returning malformed values. It checks
 * that `globals` is a record and `teardown` is a function; it does not and
 * cannot verify that `teardown` returns a promise.
 *
 * The `globals` key is validated as `string` rather than {@link AllowedGlobalNameStruct}
 * so factories may surface extras from upstream sources (e.g., Snaps'
 * `buildCommonEndowments`) without tripping the assertion. Extras are dropped
 * when a vat's config is resolved — only names in {@link ALLOWED_GLOBAL_NAMES}
 * can actually be requested.
 */
export const VatEndowmentsStruct = object({
  globals: record(string(), unknown()),
  teardown: func(),
});

/**
 * Factory that produces a fresh {@link VatEndowments} for a single vat.
 * Consumers supply this to a `VatSupervisor` to override the default
 * endowment set (see {@link createDefaultEndowments}).
 */
export type MakeAllowedGlobals = () => VatEndowments;

/**
 * Build a fresh set of vat endowments from the Snaps attenuated factories,
 * filtered to the names in {@link ALLOWED_GLOBAL_NAMES}. Each call produces
 * an isolated instance — timers and other stateful endowments are not shared
 * across vats, so one vat cannot clear another vat's timers.
 *
 * Snaps' `buildCommonEndowments()` also ships `fetch`, `console`,
 * `WebAssembly`, typed arrays, `Intl`, etc. Those are either SES intrinsics
 * already present in every Compartment (so endowing is redundant) or
 * deliberately withheld from vats (e.g., unattenuated network access).
 *
 * The aggregate `teardown` uses `Promise.allSettled` so one failing factory
 * does not silently mask failures in others; all rejections are surfaced as
 * an {@link AggregateError}.
 *
 * @returns The endowment globals and an aggregate teardown function.
 */
export function createDefaultEndowments(): VatEndowments {
  const globals: Record<string, unknown> = {};
  const teardowns: (() => Promise<void> | void)[] = [];

  for (const { names, factory } of buildCommonEndowments()) {
    if (!names.some((name) => ALLOWED_GLOBAL_NAMES_SET.has(name))) {
      continue;
    }
    let result;
    try {
      result = factory();
    } catch (error) {
      const cause = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to construct endowment factory for [${names.join(', ')}]: ${cause}`,
        { cause: error },
      );
    }
    const { teardownFunction, ...values } = result;
    for (const [key, value] of Object.entries(values)) {
      if (ALLOWED_GLOBAL_NAMES_SET.has(key)) {
        globals[key] = value;
      }
    }
    if (teardownFunction) {
      teardowns.push(teardownFunction);
    }
  }

  return harden({
    globals,
    teardown: async () => {
      const results = await Promise.allSettled(
        teardowns.map(async (fn) => fn()),
      );
      const failures = results
        .filter(
          (result): result is PromiseRejectedResult =>
            result.status === 'rejected',
        )
        .map((result) => result.reason);
      if (failures.length > 0) {
        throw new AggregateError(
          failures,
          `One or more endowment teardowns failed (${failures.length}/${teardowns.length})`,
        );
      }
    },
  });
}
