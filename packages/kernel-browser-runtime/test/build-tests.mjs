// @ts-check

import { promises as fs } from 'fs';
import path from 'path';

// eslint-disable-next-line n/no-unsupported-features/node-builtins
const buildDir = path.resolve(import.meta.dirname, '../dist/static');

await runTests();

/**
 * Runs all build tests.
 */
async function runTests() {
  try {
    await checkUntransformed();
    await checkTrustedPreludes();
    console.log('✅ Build tests passed successfully!');
  } catch (error) {
    console.error(`❌ ${error.message}`);
    throw error;
  }
}

/**
 * Test that shims and preludes are packaged untransformed.
 */
async function checkUntransformed() {
  const untransformedFiles = [
    {
      sourcePath: path.resolve('../kernel-shims/dist/endoify.js'),
      buildPath: path.resolve(buildDir, 'endoify.js'),
    },
  ];

  for (const { buildPath, sourcePath } of untransformedFiles) {
    const [originalContent, builtContent] = await Promise.all([
      fs.readFile(sourcePath, 'utf8'),
      fs.readFile(buildPath, 'utf8'),
    ]);
    if (originalContent.trim() !== builtContent.trim()) {
      throw new Error(
        `"${buildPath}" is transformed or differs from the original source.`,
      );
    }
  }
}

/**
 * Test that trusted preludes are loaded at the top of the file.
 */
async function checkTrustedPreludes() {
  const filesWithPreludes = [
    path.resolve(buildDir, 'kernel-worker/index.js'),
    path.resolve(buildDir, 'vat/index.js'),
  ];

  const expectedPrelude = `import "../endoify.js";`;

  for (const filePath of filesWithPreludes) {
    const fileContent = await fs.readFile(filePath, 'utf8');
    if (!fileContent.startsWith(expectedPrelude)) {
      throw new Error(
        `The trusted prelude \`${expectedPrelude}\` is not imported in the first position in "${filePath}"`,
      );
    }
  }
}
