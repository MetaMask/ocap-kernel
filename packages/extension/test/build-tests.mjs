import { promises as fs } from 'fs';
import path from 'path';

import {
  buildDir,
  sourceDir,
  jsTrustedPreludes,
} from '../scripts/build-constants.mjs';

const untransformedFiles = [
  {
    sourcePath: path.resolve('../shims/dist/endoify.js'),
    builtPath: path.resolve(buildDir, 'endoify.js'),
  },
  {
    sourcePath: path.resolve(sourceDir, 'dev-console.js'),
    builtPath: path.resolve(buildDir, 'dev-console.js'),
  },
  ...Object.values(jsTrustedPreludes).map((preludePath) => ({
    sourcePath: preludePath,
    builtPath: path.join(buildDir, path.basename(preludePath)),
  })),
];

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
  console.log('Checking if shims and preludes are packaged untransformed...');

  for (const { builtPath, sourcePath } of untransformedFiles) {
    const [originalContent, builtContent] = await Promise.all([
      fs.readFile(sourcePath, 'utf8'),
      fs.readFile(builtPath, 'utf8'),
    ]);
    if (originalContent.trim() !== builtContent.trim()) {
      throw new Error(
        `The ${builtPath} is transformed or differs from the original source.`,
      );
    }
  }
}

/**
 * Test that trusted preludes are loaded at the top of the file.
 */
async function checkTrustedPreludes() {
  console.log('Checking that trusted preludes are loaded at the top...');

  for (const [preludeName, preludePath] of Object.entries(jsTrustedPreludes)) {
    const expectedImport = path.basename(preludePath);
    const builtFilePath = path.join(buildDir, `${preludeName}.js`);
    const content = await fs.readFile(builtFilePath, 'utf8');
    const firstImport = content.match(/import\s*["'][^"']+["'];/u)?.[0];
    if (
      !content.startsWith('import') ||
      !firstImport?.includes(expectedImport)
    ) {
      throw new Error(
        `The trusted prelude ${expectedImport} is not imported in the first position in ${preludeName}.js`,
      );
    }
  }
}
