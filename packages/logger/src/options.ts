import { makeConsoleTransport } from './transports.ts';
import type { LoggerOptions } from './types.ts';

/**
 * The default options for the logger.
 */
export const DEFAULT_OPTIONS: Required<LoggerOptions> = {
  transports: [],
  tags: [],
};

/**
 * Parses the options for the logger.
 *
 * @param options - The options for the logger.
 * @returns The parsed options.
 */
export const parseOptions = (
  options: LoggerOptions | string | undefined,
): LoggerOptions => {
  // The default case catches whatever is not explicitly handled below.

  switch (typeof options) {
    case 'object':
      if (!options.transports) {
        return { transports: [makeConsoleTransport()], ...options };
      }
      return options;
    case 'string':
      return { tags: [options], transports: [makeConsoleTransport()] };
    case 'undefined':
      return { transports: [makeConsoleTransport()] };
    default:
      throw new Error('Invalid logger options');
  }
};

/**
 * Returns a copy of an array containing only its unique values.
 *
 * @param array - The array to filter.
 * @returns The array, without duplicate values.
 */
export const unique = <Element>(array: Element[]): Element[] => {
  return array.filter(
    (element, index, self) => self.indexOf(element) === index,
  );
};

/**
 * Merges multiple logger options into a single options object.
 *
 * @param options - The options to merge.
 * @returns The merged options.
 */
export const mergeOptions = (
  ...options: LoggerOptions[]
): Required<LoggerOptions> =>
  options.reduce<Required<LoggerOptions>>(
    (acc, option) =>
      ({
        transports: unique([...acc.transports, ...(option.transports ?? [])]),
        tags: unique([...acc.tags, ...(option.tags ?? [])]),
      }) as Required<LoggerOptions>,
    DEFAULT_OPTIONS,
  );
