import { Logger } from '@metamask/logger';

/**
 * The logger for the demo.
 */
export const logger = new Logger({
  tags: [],
  transports: [
    // This transport only logs messages from the top level logger.
    (entry) =>
      entry.tags.length === 0
        ? console[entry.level](entry.message, ...(entry.data ?? []))
        : undefined,
    // This transport only logs messages from the vat worker.
    (entry) =>
      entry.tags.includes('console')
        ? console[entry.level](`:: ${entry.message}`, ...(entry.data ?? []))
        : undefined,
  ],
});
