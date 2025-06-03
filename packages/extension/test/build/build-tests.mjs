import { promises as fs } from 'fs';
import path from 'path';

import {
  buildDir,
  sourceDir,
  trustedPreludes,
} from '../../scripts/build-constants.mjs';

const { hasOwn } = Object;

const untransformedFiles = [
  {
    sourcePath: path.resolve('../kernel-shims/dist/endoify.js'),
    buildPath: path.resolve(buildDir, 'endoify.js'),
  },
  {
    sourcePath: path.resolve(sourceDir, 'env/dev-console.js'),
    buildPath: path.resolve(buildDir, 'dev-console.js'),
  },
  ...Object.values(trustedPreludes).map((prelude) => {
    if (hasOwn(prelude, 'path')) {
      return {
        sourcePath: prelude.path,
        buildPath: path.join(buildDir, path.basename(prelude.path)),
      };
    }

    const preludePath = /^import ["']([^"']+)["']/iu.exec(prelude.content)[1];
    if (!preludePath) {
      throw new Error('No prelude path found in content');
    }

    return {
      sourcePath: preludePath,
      buildPath: path.join(buildDir, path.basename(preludePath)),
    };
  }),
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
  for (const [outputFileName, prelude] of Object.entries(trustedPreludes)) {
    const outputFilePath = path.join(buildDir, `${outputFileName}.js`);
    const outputFileContent = await fs.readFile(outputFilePath, 'utf8');
    const expectedImportStatement = hasOwn(prelude, 'path')
      ? `import "./${path.basename(prelude.path)}";`
      : prelude.content;

    if (!outputFileContent.startsWith(expectedImportStatement)) {
      throw new Error(
        `The trusted prelude \`${expectedImportStatement}\` is not imported in the first position in "${outputFileName}.js"`,
      );
    }
  }
}
