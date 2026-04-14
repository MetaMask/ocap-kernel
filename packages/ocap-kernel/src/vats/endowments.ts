/**
 * The default set of host/Web API globals that vats may request as endowments.
 * These are NOT ECMAScript intrinsics and are therefore absent from SES
 * Compartments unless explicitly provided.
 *
 * JS intrinsics (e.g. `ArrayBuffer`, `BigInt`, `Intl`, typed arrays) are
 * already available in every Compartment and do not need to be endowed.
 * `Date` is an intrinsic too, but lockdown tames it (`Date.now()` returns
 * `NaN`); passing it here restores the real implementation.
 *
 * Functions that require a specific `this` context are bound to `globalThis`
 * before hardening.
 */
export const DEFAULT_ALLOWED_GLOBALS: Record<string, unknown> = harden({
  // Timers (host API)
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),

  // Date (intrinsic, but tamed by lockdown — endowing restores real Date.now)
  Date: globalThis.Date,

  // Web APIs
  TextEncoder: globalThis.TextEncoder,
  TextDecoder: globalThis.TextDecoder,
  URL: globalThis.URL,
  URLSearchParams: globalThis.URLSearchParams,
  atob: globalThis.atob.bind(globalThis),
  btoa: globalThis.btoa.bind(globalThis),
  AbortController: globalThis.AbortController,
  AbortSignal: globalThis.AbortSignal,
});
