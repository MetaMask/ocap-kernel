import { makeCounter } from '@ocap/utils';

/**
 * Validates a bundle URL.
 *
 * @param url - The bundle URL to validate
 * @returns Whether the URL is a valid bundle URL
 */
export function isValidBundleUrl(url?: string): boolean {
  if (!url) {
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    return parsedUrl.pathname.trim().toLowerCase().endsWith('.bundle');
  } catch {
    return false;
  }
}

const idCounter = makeCounter();
export const nextMessageId = (): string => `ui:${idCounter()}`;
