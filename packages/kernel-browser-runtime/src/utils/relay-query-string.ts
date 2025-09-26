import { Logger } from '@metamask/logger';

/**
 * Utilities for handling relay query strings in kernel workers.
 */

const logger = new Logger('relay-query-string');

/**
 * Creates a query string parameter for relay addresses.
 *
 * @param relays - Array of relay addresses (e.g., libp2p multiaddrs)
 * @returns Encoded query string parameter for relays
 */
export function createRelayQueryString(relays: string[]): string {
  return `relays=${encodeURIComponent(JSON.stringify(relays))}`;
}

/**
 * Parses relay addresses from a query string.
 *
 * @param queryString - The query string (e.g., from window.location.search)
 * @returns Array of relay addresses, or empty array if parsing fails
 */
export function parseRelayQueryString(queryString: string): string[] {
  try {
    const relaysParam = queryString.split('relays=')[1];
    if (!relaysParam) {
      return [];
    }
    return JSON.parse(decodeURIComponent(relaysParam.split('&')[0] ?? '[]'));
  } catch (error) {
    logger.error('Error parsing relays from query string:', error);
    return [];
  }
}

/**
 * Creates a Worker URL with relay query parameters.
 *
 * @param workerPath - Path to the worker script (e.g., 'kernel-worker.js')
 * @param relays - Array of relay addresses
 * @returns Complete URL for creating a Worker with relay parameters
 */
export function createWorkerUrlWithRelays(
  workerPath: string,
  relays: string[],
): string {
  const separator = workerPath.includes('?') ? '&' : '?';
  return `${workerPath}${separator}${createRelayQueryString(relays)}`;
}

/**
 * Gets relay addresses from the current global location's query string.
 * This is intended to be used within a worker context.
 *
 * @returns Array of relay addresses from the current location
 */
export function getRelaysFromCurrentLocation(): string[] {
  if (typeof globalThis.location === 'undefined') {
    logger.warn('No location object available in current context');
    return [];
  }
  return parseRelayQueryString(globalThis.location.search);
}
