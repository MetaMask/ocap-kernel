import type { LogEntry } from '@metamask/logger';

// extract ignored logger tags from environment variable

const ignoreTags =
  // eslint-disable-next-line n/no-process-env
  process?.env?.LOGGER_IGNORE?.split(',')?.map((tag) => tag.trim()) ?? [];

/**
 * Filter a logger transport to ignore command line specified ignore tags.
 *
 * @param transports - The transports to filter.
 * @returns A transport that filters out the ignore tags.
 */
export const filterTransports = (
  ...transports: ((entry: LogEntry) => void)[]
): ((entry: LogEntry) => void) =>
  ignoreTags.includes('all')
    ? () => undefined
    : (entry) => {
        if (ignoreTags.some((tag) => entry.tags.includes(tag))) {
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
