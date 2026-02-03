import type { Logger } from '@metamask/logger';

/**
 * Powers provided to test vats that need structured logging.
 */
export type TestPowers = {
  logger: Logger;
};

/**
 * Extract a tlog function from test vat powers.
 *
 * @param powers - The vat powers containing a logger.
 * @param name - The vat name to include in log tags.
 * @returns A function that logs with 'test' and name tags.
 */
export function unwrapTestLogger(
  powers: TestPowers,
  name: string,
): (message: string, ...args: unknown[]) => void {
  const logger = powers.logger.subLogger({ tags: ['test', name] });
  return (message: string, ...args: unknown[]): void =>
    logger.log(message, ...args);
}
