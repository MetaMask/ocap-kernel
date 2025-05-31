import type { Json } from '@metamask/utils';

import { runBundle } from '../../run-bundle.ts';
import makeDemoUtils from '../utils.ts';

const { logger, resolve } = makeDemoUtils(import.meta);

const DEFAULT_BUNDLE_PARAMS = '{ "name": "Alice" }';

/**
 * Runs the vat creation demo.
 *
 * @param args - The arguments to the demo.
 * @param args."0" - The path to the bundle file. Defaults to `my-vat.bundle`.
 * @param args."1" - The bundle parameters. Defaults to `{ "name": "alice" }`.
 * @param args."2" - The name of the method to run. Defaults to `hello`.
 * @returns A promise that resolves when the demo completes
 */
export default async function run([
  bundlePath = 'my-vat.bundle',
  bundleParams = DEFAULT_BUNDLE_PARAMS,
  methodName = 'hello',
]: string[]): Promise<unknown> {
  logger.log('Resolving demo arguments...');

  const resolvedBundlePath = resolve(bundlePath);
  if (!resolvedBundlePath) {
    logger.error(
      [
        '',
        'The first argument must be the path to a bundle file. The default bundle for this demo is `my-vat.bundle`.',
        "If it does not already exist, you can bundle the vat's source code by running:",
        '',
        '  yarn ocap bundle my-vat.js',
        '',
        'From the `demos/01-vat-creation` directory.',
        '',
      ].join('\n'),
    );
    throw new Error('Missing bundle path');
  }

  let bundleParameters: Record<string, Json>;
  try {
    bundleParameters = JSON.parse(bundleParams) as Record<string, Json>;
  } catch (cause) {
    logger.error(
      [
        '',
        'Second argument must be a stringified JSON object representing the parameters to pass to buildRootObject.',
        '',
        `The default parameters object for this demo is ${DEFAULT_BUNDLE_PARAMS}`,
        '',
      ].join('\n'),
    );
    throw new Error(`Invalid bundle parameters: ${bundleParams}`, { cause });
  }

  const bundleOptions = { bundleParameters, logger };

  return await runBundle(resolvedBundlePath, methodName, bundleOptions);
}
