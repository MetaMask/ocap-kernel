import { Logger } from '@metamask/logger';
import type { RemoteCommsOptions } from '@metamask/ocap-kernel';
import { integer, is, min } from '@metamask/superstruct';
import { JsonStruct } from '@metamask/utils';
import type { Json } from '@metamask/utils';

/**
 * Utilities for carrying a {@link NetlayerSpecifier} plus the kernel-level
 * remote-comms options through the kernel worker URL query string. The
 * netlayer's `config` is `Json` and travels as a single JSON-encoded param;
 * the sensitive `mnemonic` is never placed in a URL.
 */

const logger = new Logger('comms-query-string');

/**
 * Parameters accepted by {@link createCommsQueryString}: the netlayer name and
 * its `Json` config, plus the kernel-level numeric options the worker forwards.
 */
export type CommsQueryParams = {
  netlayer: string;
  config: Json;
  maxQueue?: number | undefined;
  ackTimeoutMs?: number | undefined;
  maxUrlRelayHints?: number | undefined;
  maxKnownRelays?: number | undefined;
};

const NUMBER_PARAM_NAMES = [
  'maxQueue',
  'ackTimeoutMs',
  'maxUrlRelayHints',
  'maxKnownRelays',
] as const;

const NonNegativeInteger = min(integer(), 0);

/**
 * Build URLSearchParams for the kernel worker URL from a netlayer specifier and
 * kernel-level options. Callers can append additional params (e.g.
 * reset-storage) before assigning to `URL.search`.
 *
 * @param params - The netlayer name, its `Json` config, and kernel options.
 * @returns URLSearchParams; use `.toString()` for `URL.search`.
 */
export function createCommsQueryString(
  params: CommsQueryParams,
): URLSearchParams {
  const searchParams = new URLSearchParams();
  searchParams.set('netlayer', params.netlayer);
  searchParams.set('netlayer-config', JSON.stringify(params.config));

  for (const key of NUMBER_PARAM_NAMES) {
    const value = params[key];
    if (value === undefined) {
      continue;
    }
    if (!is(value, NonNegativeInteger)) {
      throw new TypeError(
        `createCommsQueryString: ${key} must be a non-negative integer, got ${typeof value} ${JSON.stringify(value)}`,
      );
    }
    searchParams.set(key, String(value));
  }

  return searchParams;
}

/**
 * Parse a netlayer specifier plus kernel-level options from a query string.
 * Returns a {@link RemoteCommsOptions} suitable for
 * {@link Kernel.initRemoteComms}. When no `netlayer` param is present, the
 * specifier is omitted (the kernel then falls back to its default netlayer).
 *
 * @param queryString - The query string (e.g. from `window.location.search`).
 * @returns Partial remote-comms options.
 */
export function parseCommsQueryString(queryString: string): RemoteCommsOptions {
  const options: RemoteCommsOptions = {};
  const search = queryString.startsWith('?')
    ? queryString.slice(1)
    : queryString;
  const params = new URLSearchParams(search);

  const netlayer = params.get('netlayer');
  if (netlayer !== null && netlayer !== '') {
    const rawConfig = params.get('netlayer-config');
    let config: Json = {};
    if (rawConfig !== null && rawConfig !== '') {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawConfig);
      } catch {
        throw new TypeError(
          `parseCommsQueryString: netlayer-config contains invalid JSON: ${rawConfig}`,
        );
      }
      if (!is(parsed, JsonStruct)) {
        throw new TypeError(
          `parseCommsQueryString: netlayer-config must be JSON, got ${rawConfig}`,
        );
      }
      config = parsed;
    }
    options.specifier = { netlayer, config };
  }

  for (const key of NUMBER_PARAM_NAMES) {
    const raw = params.get(key);
    if (raw !== null && raw !== '') {
      const parsed = Number(raw);
      if (!is(parsed, NonNegativeInteger)) {
        throw new TypeError(
          `parseCommsQueryString: ${key} must be a non-negative integer, got ${raw}`,
        );
      }
      options[key] = parsed;
    }
  }

  return options;
}

/**
 * Get the remote comms options from the current global location's query string.
 * Intended for the kernel worker when calling {@link Kernel.initRemoteComms}.
 *
 * @returns Partial {@link RemoteCommsOptions}.
 */
export function getCommsParamsFromCurrentLocation(): RemoteCommsOptions {
  if (typeof globalThis.location === 'undefined') {
    logger.warn('No location object available in current context');
    return {};
  }
  return parseCommsQueryString(globalThis.location.search);
}
