// @ts-check

import bundleSource from '@endo/bundle-source';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import endoScriptIdentifierTransformPlugin from './rollup-plugin-endo-script-identifier-transform.js';

/**
 * Generate an `endoScript` bundle from a specified module and its
 * dependencies. Optionally, also rewriting the module shimming
 * identifiers introduced by `@endo/module-source` to avoid errors
 * for unexpected zero-width-joiner characters.
 *
 * When the `bundle` options are omitted, the default options
 * used are: `{ format: 'endoScript' }`.
 *
 * The `rewrite` operation will be skipped when:
 *   - The `rewrite` is `false`
 *   - The `rewrite` option  and the `argv` options are omitted
 *   - The `argv` option does not include `--with-zwj-rewrite`
 *
 * Otherwise, when the `rewrite` option is `true` or some of its
 * options are omitted, the `argv` option is checked for the
 * following flags:
 *   - `--with-zwj-rewrite` (not recommended)
 *   - `--zwj-rewrite-without-validation` (not recommended)
 *   - `--zwj-rewrite-debug`
 *   - `--zwj-rewrite-verbose`
 *   - `--zwj-rewrite-time`
 *
 * @param {string} specifier - The specifier of the module.
 * @param {string} outputPath - The file path where the bundle will be written.
 * @param {object} [options] - The fine-grained options for the specific operations.
 * @param {string} [options.scope] - The root path used for reporting sanitization.
 * @param {EndoScriptBundleSourceOptions} [options.bundle] - The fine-grained options passed to `bundleSource`.
 * @param {EndoScriptIdentifierTransformOptions | boolean} [options.rewrite] - Wether to explicitly opt-out (`false`), opt-in (`true`), or the fine-grained options passed to `endoScriptIdentifierTransformPlugin`.
 * @param {string[] | Readonly<string[]>} [options.argv] - The command-line arguments to use for determining the defaults.
 * @returns {Promise<void>}
 */
export async function generateEndoScriptBundle(specifier, outputPath, options) {
  const sourcePath = fileURLToPath(import.meta.resolve(specifier));

  let { source } = await bundleSource(sourcePath, {
    format: 'endoScript',
    ...options?.bundle,
  });

  if (options?.rewrite ?? options?.argv?.includes?.('--with-zwj-rewrite')) {
    source =
      endoScriptIdentifierTransformPlugin({
        validation:
          options?.argv &&
          !options?.argv?.includes?.('--zwj-rewrite-without-validation'),
        debugging:
          options?.argv &&
          ((options?.argv?.includes?.('--zwj-rewrite-verbose') && 'VERBOSE') ||
            options?.argv?.includes?.('--zwj-rewrite-debug')),
        timing: options?.argv?.includes?.('--zwj-rewrite-time'),
        ...Object(options?.rewrite),
        scopedRoot:
          options?.scope ??
          // @ts-expect-error - The `scopedRoot` option is not yet supported.
          options?.rewrite?.scopedRoot ??
          fileURLToPath(new URL('../../../../', import.meta.url)),
      }).transform(source, specifier)?.code ?? source;
  }

  await writeFile(outputPath, source);
}

/** @typedef {import('@endo/bundle-source').BundleOptions<'endoScript'>} EndoScriptBundleSourceOptions */
/** @typedef {import('./rollup-plugin-endo-script-identifier-transform.js')} EndoScriptIdentifierTransformOptions */
