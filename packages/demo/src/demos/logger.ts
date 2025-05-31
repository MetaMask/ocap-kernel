import { Fail } from '@endo/errors';
import { Logger } from '@metamask/logger';

export const nullLogger = new Logger({ transports: [] });

/**
 * Creates a logger for a demo. The subLogger method returns a logger which does nothing.
 *
 * @param meta - The import meta object.
 * @returns A logger for the demo.
 */
export default function makeDemoLogger(meta: ImportMeta): Logger {
  const dirName = meta.dirname.split('/').pop();
  const kebabs = dirName?.split('-');
  const [head, ...tail] = kebabs ?? [];
  const number =
    head ??
    Fail`Expected to be called from a demo directory, but got ${dirName}`;
  const title =
    tail?.map((k) => k.charAt(0).toUpperCase() + k.slice(1)).join(' ') ??
    Fail`Expected to be called from a demo directory, but got ${dirName}`;

  const logger = new Logger(`DEMO ${number}: ${title}`);

  return new Proxy(logger, {
    get: (target: Logger, prop: string) => {
      if (prop === 'subLogger') {
        return () => nullLogger;
      }
      return target[prop as keyof Logger];
    },
  });
}
