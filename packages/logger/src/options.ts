import { consoleTransport } from './transports.ts';
import type { LoggerOptions } from './types.ts';

/**
 * The default options for the logger.
 */
export const DEFAULT_OPTIONS: Required<LoggerOptions> = {
  transports: [],
  level: 'info',
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
  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
  switch (typeof options) {
    case 'object':
      return options;
    case 'string':
      return { tags: [options], transports: [consoleTransport] };
    case 'undefined':
      return { transports: [consoleTransport] };
    default:
      throw new Error('Invalid logger options');
  }
};

/**
 * A slow (O(n^2)) way to uniquify an array.
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
        level: option.level ?? acc.level,
        tags: unique([...acc.tags, ...(option.tags ?? [])]),
      }) as Required<LoggerOptions>,
    DEFAULT_OPTIONS,
  );
