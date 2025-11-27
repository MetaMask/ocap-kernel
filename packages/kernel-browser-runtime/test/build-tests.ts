import { runTests } from '@ocap/repo-tools/build-utils/test';
import path from 'node:path';

const outDir = path.resolve(import.meta.dirname, '../dist/static');

const untransformedFiles = [
  {
    sourcePath: path.resolve('../kernel-shims/dist/endoify.js'),
    buildPath: path.resolve(outDir, 'endoify.js'),
  },
];
const endoifyImportStatement = 'import "../endoify.js";';
const trustedPreludes = {
  'kernel-worker/index': {
    content: endoifyImportStatement,
  },
  'vat/index': { content: endoifyImportStatement },
};

await runTests({ outDir, untransformedFiles, trustedPreludes });
