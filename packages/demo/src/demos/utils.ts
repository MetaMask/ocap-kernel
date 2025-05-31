import type { Logger } from '@metamask/logger';

import makeDemoFs from './fs.ts';
import type { DemoFs } from './fs.ts';
import makeDemoLogger from './logger.ts';

type DemoUtils = DemoFs & { logger: Logger };

/**
 * Creates a set of utilities for running a demo inside a directory context.
 *
 * @param meta - The import meta object.
 * @returns An object with the following properties:
 * - `logger`: A logger for the demo.
 * - `readFile`: A function that reads a file from the demo root.
 * - `readJson`: A function that reads a json file from the demo root.
 * - `resolve`: A function that resolves a path relative to the demo root.
 */
export default function makeDemoUtils(meta: ImportMeta): DemoUtils {
  return {
    logger: makeDemoLogger(meta),
    ...makeDemoFs(meta),
  };
}
