import { runTests } from '@ocap/repo-tools/build-utils/test';
import type { UntransformedFiles } from '@ocap/repo-tools/build-utils/test';
import path from 'node:path';

import {
  outDir,
  sourceDir,
  trustedPreludes,
} from '../../scripts/build-constants.mjs';

const untransformedFiles = [
  {
    sourcePath: path.resolve('../kernel-shims/dist/endoify.js'),
    buildPath: path.resolve(outDir, 'endoify.js'),
  },
  {
    sourcePath: path.resolve(sourceDir, 'env/dev-console.js'),
    buildPath: path.resolve(outDir, 'dev-console.js'),
  },
  ...Object.values(trustedPreludes).map((prelude) => {
    if ('path' in prelude) {
      return {
        sourcePath: prelude.path,
        buildPath: path.join(outDir, path.basename(prelude.path)),
      };
    }

    // This is a "content" prelude, which does not specify an original source path.
    return undefined;
  }),
].filter(Boolean) as UntransformedFiles;

await runTests({ outDir, untransformedFiles, trustedPreludes });
