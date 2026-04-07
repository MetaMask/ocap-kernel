import { Logger } from '@metamask/logger';
import type { RemoteCommsOptions } from '@metamask/ocap-kernel';
import { array, integer, is, min, string } from '@metamask/superstruct';

/**
 * Utilities for handling remote comms options in worker URL query strings.
 * Supports all serializable fields of {@link RemoteCommsOptions} except
 * `directTransports` (internal / not URL-serializable) and `mnemonic`
 * (secret — should not be exposed in URLs).
 */

const logger = new Logger('comms-query-string');

/**
 * Subset of {@link RemoteCommsOptions} that can be encoded in a query string.
 * Excludes `directTransports` (internal, platform-injected) and `mnemonic`
 * (secret — must not appear in URLs; pass via postMessage instead).
 */
export type CommsQueryParams = Omit<
  RemoteCommsOptions,
  'directTransports' | 'mnemonic'
>;

/** Keys of RemoteCommsOptions whose value is string[] (URL-serialized as JSON array). */
type ArrayParamKey = {
  [K in keyof CommsQueryParams]: CommsQueryParams[K] extends
    | string[]
    | undefined
    ? K
    : never;
}[keyof CommsQueryParams];

/** Keys of RemoteCommsOptions whose value is number (URL-serialized as string). */
type NumberParamKey = {
  [K in keyof CommsQueryParams]: CommsQueryParams[K] extends number | undefined
    ? K
    : never;
}[keyof CommsQueryParams];

const ARRAY_PARAM_NAMES = [
  'relays',
  'allowedWsHosts',
  'directListenAddresses',
] as const satisfies readonly ArrayParamKey[];

const NUMBER_PARAM_NAMES = [
  'maxRetryAttempts',
  'maxQueue',
  'maxConcurrentConnections',
  'maxMessageSizeBytes',
  'cleanupIntervalMs',
  'stalePeerTimeoutMs',
  'maxMessagesPerSecond',
  'maxConnectionAttemptsPerMinute',
  'reconnectionBaseDelayMs',
  'reconnectionMaxDelayMs',
  'handshakeTimeoutMs',
  'writeTimeoutMs',
  'ackTimeoutMs',
  'streamInactivityTimeoutMs',
] as const satisfies readonly NumberParamKey[];

const NonNegativeInteger = min(integer(), 0);
const StringArray = array(string());

/**
 * Creates URLSearchParams from remote comms options.
 * Use when building the kernel worker URL so the worker can read all params.
 * Callers can append additional params (e.g. reset-storage) before assigning to URL.search.
 * Validates types at runtime via superstruct; throws if invalid values are passed.
 *
 * @param params - Subset of {@link RemoteCommsOptions} (excluding directTransports)
 * @returns URLSearchParams with comms options; use .toString() for URL.search
 */
export function createCommsQueryString(
  params: CommsQueryParams,
): URLSearchParams {
  const searchParams = new URLSearchParams();

  for (const key of ARRAY_PARAM_NAMES) {
    const value = params[key];
    if (value === undefined) {
      continue;
    }
    if (!is(value, StringArray)) {
      throw new TypeError(
        `createCommsQueryString: ${key} must be an array of strings, got ${typeof value}`,
      );
    }
    if (value.length > 0) {
      searchParams.set(key, JSON.stringify(value));
    }
  }

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
 * Parses all supported {@link RemoteCommsOptions} from a query string.
 * Only includes keys that are present and valid in the query string.
 *
 * @param queryString - The query string (e.g., from window.location.search)
 * @returns Partial options object suitable for {@link Kernel.initRemoteComms}
 */
export function parseCommsQueryString(queryString: string): CommsQueryParams {
  const options: CommsQueryParams = {};
  const search = queryString.startsWith('?')
    ? queryString.slice(1)
    : queryString;
  const params = new URLSearchParams(search);

  for (const key of ARRAY_PARAM_NAMES) {
    const raw = params.get(key);
    if (raw !== null && raw !== '') {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new TypeError(
          `parseCommsQueryString: ${key} contains invalid JSON: ${raw}`,
        );
      }
      if (!is(parsed, StringArray)) {
        throw new TypeError(
          `parseCommsQueryString: ${key} must be a JSON array of strings, got ${raw}`,
        );
      }
      options[key] = parsed;
    }
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
 * Gets all supported remote comms options from the current global location's
 * query string. Intended for use within the kernel worker when calling
 * {@link Kernel.initRemoteComms}.
 *
 * @returns Partial {@link RemoteCommsOptions} (excluding directTransports)
 */
export function getCommsParamsFromCurrentLocation(): CommsQueryParams {
  if (typeof globalThis.location === 'undefined') {
    logger.warn('No location object available in current context');
    return {};
  }
  return parseCommsQueryString(globalThis.location.search);
}
