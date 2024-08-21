/* eslint-disable n/no-sync */
import jsdom from 'jsdom';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const endoifyBundleSourceTextURL = new URL(
  '../../shims/dist/endoify.mjs',
  import.meta.url.replace(/^https?:\/\/.*?\/@fs\//u, 'file:///'),
);

/**
 * Run an endoified test with endowments.
 *
 * @param test - The test to run. It must be a synchronous function that takes `endowments` as its only parameter.
 * @param endowments - Endowments passed to the test. They must include `vitest` capabilities like `it` and `expect`.
 * @param endoifySourceLocation - Optional path to the endoify bundle. It must either be absolute or relative to `process.cwd()`.
 * @returns The return value of the test.
 */
export default function endoified<
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  Endowments extends Partial<typeof import('vitest')>,
>(
  test: (endowments: Endowments) => void,
  endowments: Endowments,
  endoifySourceLocation?: string | URL,
): () => void {
  return () => {
    const relativeEndoifySourcePath = path.relative(
      '.',
      // eslint-disable-next-line no-nested-ternary
      endoifySourceLocation && typeof endoifySourceLocation === 'string'
        ? endoifySourceLocation
        : endoifySourceLocation && endoifySourceLocation instanceof URL
        ? fileURLToPath(endoifySourceLocation.href)
        : fileURLToPath(endoifyBundleSourceTextURL.href),
    );

    console.log({ relativeEndoifySourcePath });

    const evaluatorSourceText = String(test);
    const endoifySourceText = readFileSync(relativeEndoifySourcePath, 'utf-8');

    console.log({ endoifySourceText });

    const dom = new jsdom.JSDOM(``, { runScripts: 'outside-only' });

    dom.window.eval(endoifySourceText);
    (dom.window.eval(evaluatorSourceText) as typeof test)(endowments);
  };
}
