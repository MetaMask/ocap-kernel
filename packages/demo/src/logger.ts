import { Logger } from '@metamask/logger';

const isVatId = (id: string): boolean => id.startsWith('v');
const vatIdLabel = (tags: string[]): string =>
  tags.filter(isVatId)[0]?.slice(1)?.padStart(2, '0') ?? '??';

/**
 * The logger for the demo.
 */
export const logger = new Logger({
  tags: [],
  transports: [
    // This transport only logs messages from the top level logger.
    (entry) =>
      entry.tags.length === 0
        ? // We're not using the console, but specifying it as a log endpoint.
          // eslint-disable-next-line no-console
          console[entry.level](entry.message, ...(entry.data ?? []))
        : undefined,
    // This transport only logs messages from the vat worker.
    (entry) =>
      entry.tags.includes('console')
        ? // We're not using the console, but specifying it as a log endpoint.
          // eslint-disable-next-line no-console
          console[entry.level](
            `${vatIdLabel(entry.tags)} | ${entry.message}`,
            ...(entry.data ?? []),
          )
        : undefined,
  ],
});
