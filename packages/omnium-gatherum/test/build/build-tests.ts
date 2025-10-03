import { runTests } from '@ocap/repo-tools/build-utils/test';
import path from 'node:path';

// eslint-disable-next-line n/no-unsupported-features/node-builtins
const packageDir = path.resolve(import.meta.dirname, '../../');
const outDir = path.resolve(packageDir, 'dist');
const untransformedFiles = [
  {
    sourcePath: path.resolve(packageDir, '../kernel-shims/dist/endoify.js'),
    buildPath: path.resolve(outDir, 'endoify.js'),
  },
];

const endoifyImportStatement = "import './endoify.js';";
export const trustedPreludes = {
  background: {
    content: endoifyImportStatement,
  },
  'kernel-worker': { content: endoifyImportStatement },
};

await runTests({ outDir, untransformedFiles, trustedPreludes });
