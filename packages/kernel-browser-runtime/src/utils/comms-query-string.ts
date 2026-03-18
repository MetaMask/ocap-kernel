import { Logger } from '@metamask/logger';
import type { RemoteCommsOptions } from '@metamask/ocap-kernel';

/**
 * Utilities for handling remote comms options in worker URL query strings.
 * Supports all serializable fields of {@link RemoteCommsOptions} except
 * `directTransports` (internal / not URL-serializable).
 */

const logger = new Logger('comms-query-string');

/**
 * Subset of {@link RemoteCommsOptions} that can be encoded in a query string.
 * Excludes `directTransports` (internal, platform-injected).
 */
export type CommsQueryParams = Partial<
  Omit<RemoteCommsOptions, 'directTransports'>
>;

type SerializableCommsOptions = Omit<RemoteCommsOptions, 'directTransports'>;

/** Keys of RemoteCommsOptions whose value is string[] (URL-serialized as JSON array). */
type ArrayParamKey = {
  [K in keyof SerializableCommsOptions]: SerializableCommsOptions[K] extends
    | string[]
    | undefined
    ? K
    : never;
}[keyof SerializableCommsOptions];

/** Keys of RemoteCommsOptions whose value is number (URL-serialized as string). */
type NumberParamKey = {
  [K in keyof SerializableCommsOptions]: SerializableCommsOptions[K] extends
    | number
    | undefined
    ? K
    : never;
}[keyof SerializableCommsOptions];

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
] as const satisfies readonly NumberParamKey[];

/**
 * Parses a JSON-encoded array from a query string parameter.
 *
 * @param queryString - The query string (e.g., from window.location.search)
 * @param paramName - Name of the query parameter
 * @returns Array of strings, or undefined if param is missing or parsing fails
 */
function parseJsonArrayParam(
  queryString: string,
  paramName: string,
): string[] | undefined {
  try {
    const param = queryString.split(`${paramName}=`)[1];
    if (!param) {
      return undefined;
    }
    const value = param.split('&')[0];
    if (value === undefined) {
      return undefined;
    }
    const parsed = JSON.parse(decodeURIComponent(value));
    if (!Array.isArray(parsed)) {
      return undefined;
    }
    return parsed.every((item): item is string => typeof item === 'string')
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Parses a non-negative integer from a query string parameter.
 *
 * @param queryString - The query string
 * @param paramName - Name of the query parameter
 * @returns Parsed number, or undefined if param is missing or invalid
 */
function parseNumberParam(
  queryString: string,
  paramName: string,
): number | undefined {
  try {
    const param = queryString.split(`${paramName}=`)[1];
    if (!param) {
      return undefined;
    }
    const value = param.split('&')[0];
    if (value === undefined) {
      return undefined;
    }
    const decoded = decodeURIComponent(value);
    const parsed = Number(decoded);
    if (!Number.isInteger(parsed) || parsed < 0 || !Number.isFinite(parsed)) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * Parses a string from a query string parameter.
 *
 * @param queryString - The query string
 * @param paramName - Name of the query parameter
 * @returns Decoded string, or undefined if param is missing
 */
function parseStringParam(
  queryString: string,
  paramName: string,
): string | undefined {
  try {
    const param = queryString.split(`${paramName}=`)[1];
    if (!param) {
      return undefined;
    }
    const value = param.split('&')[0];
    return value === undefined ? undefined : decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

/**
 * Creates URLSearchParams from remote comms options.
 * Use when building the kernel worker URL so the worker can read all params.
 * Callers can append additional params (e.g. reset-storage) before assigning to URL.search.
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
    if (value !== undefined && value.length > 0) {
      searchParams.set(key, JSON.stringify(value));
    }
  }

  for (const key of NUMBER_PARAM_NAMES) {
    const value = params[key];
    if (value !== undefined) {
      searchParams.set(key, String(value));
    }
  }

  if (params.mnemonic !== undefined && params.mnemonic !== '') {
    searchParams.set('mnemonic', params.mnemonic);
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

  for (const key of ARRAY_PARAM_NAMES) {
    const value = parseJsonArrayParam(queryString, key);
    if (value !== undefined) {
      options[key] = value;
    }
  }

  for (const key of NUMBER_PARAM_NAMES) {
    const value = parseNumberParam(queryString, key);
    if (value !== undefined) {
      options[key] = value;
    }
  }

  const mnemonic = parseStringParam(queryString, 'mnemonic');
  if (mnemonic !== undefined && mnemonic !== '') {
    options.mnemonic = mnemonic;
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
