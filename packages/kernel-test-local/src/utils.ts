import type { LogEntry } from '@metamask/logger';

import { IGNORE_TAGS } from './constants.ts';

/**
 * Filter a logger transport to ignore command line specified ignore tags.
 *
 * @param transports - The transports to filter.
 * @returns A transport that filters out the ignore tags.
 */
export const filterTransports = (
  ...transports: ((entry: LogEntry) => void)[]
): ((entry: LogEntry) => void) =>
  IGNORE_TAGS.includes('all')
    ? () => undefined
    : (entry) => {
        if (IGNORE_TAGS.some((tag) => entry.tags.includes(tag))) {
          return;
        }
        transports.forEach((transport) => transport(entry));
      };

/**
 * Generate a random letter.
 *
 * @returns a random letter.
 */
export function randomLetter(): string {
  return String.fromCharCode(Math.floor(Math.random() * 26) + 97);
}
