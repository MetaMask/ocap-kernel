import { promises as fs } from 'fs';
import path from 'path';

import { jsTrustedPreludes } from '../vite.config.ts';

// Paths to the built files
const buildDir = path.join(process.cwd(), 'dist');
const sourceDir = path.join(process.cwd(), 'src');
const trustedFiles = [
  'background-trusted-prelude.js',
  'kernel-worker-trusted-prelude.js',
];
const shimFiles = [
  {
    buildFile: 'endoify.js',
    sourcePath: path.join(process.cwd(), '../shims/dist/endoify.js'),
  },
  {
    buildFile: 'dev-console.js',
    sourcePath: path.join(sourceDir, 'dev-console.js'),
  },
];

/**
 * Test that shims are packaged untransformed
 */
async function checkShimsUntransformed() {
  console.log('Checking if shims are packaged untransformed...');

  for (const { buildFile, sourcePath } of shimFiles) {
    const builtPath = path.join(buildDir, buildFile);

    if (!(await fs.stat(builtPath)).isFile()) {
      throw new Error(`Built file ${buildFile} is missing in the build output`);
    }

    const [originalContent, builtContent] = await Promise.all([
      fs.readFile(sourcePath, 'utf8'),
      fs.readFile(builtPath, 'utf8'),
    ]);

    if (originalContent.trim() !== builtContent.trim()) {
      throw new Error(
        `The ${buildFile} file is transformed or differs from the original source.`,
      );
    }
  }

  console.log('✅ Shims are packaged untransformed');
}

/**
 * Test that trusted headers are preserved
 */
async function checkTrustedPreludes() {
  console.log('Checking that trusted preludes are loaded at the top...');

  for (const [key, preludePath] of Object.entries(jsTrustedPreludes)) {
    const expectedImport = path.basename(preludePath); // Extract the filename
    const builtFilePath = path.join(buildDir, `${key}.js`); // Adjust file extension if needed

    if (!(await fs.stat(builtFilePath)).isFile()) {
      throw new Error(`Built file ${key}.js is missing in the build output`);
    }

    const content = await fs.readFile(builtFilePath, 'utf8');

    // Check if the trusted prelude import is at the top
    const firstImportMatch = content.match(/import .*;/);
    if (!firstImportMatch || !firstImportMatch[0].includes(expectedImport)) {
      throw new Error(
        `The trusted prelude ${expectedImport} is not imported in the first position in ${key}.js`,
      );
    }
  }

  console.log('✅ Trusted preludes are imported in the first position');
}

/**
 * Test that trusted headers are preserved
 */
async function checkHeadersInFirstPosition() {
  console.log(
    'Checking that files with trusted headers import them in the first position...',
  );

  for (const file of trustedFiles) {
    const builtFilePath = path.join(buildDir, file);
    const content = await fs.readFile(builtFilePath, 'utf8');

    const firstImportMatch = content.match(/import .*;/);
    if (!firstImportMatch || !firstImportMatch[0].includes('./endoify.js')) {
      throw new Error(`Trusted header not in the first position in ${file}`);
    }
  }

  console.log('✅ Trusted headers are in the first position');
}

/**
 * Run all tests
 */
async function runTests() {
  await checkShimsUntransformed();
  await checkTrustedPreludes();
  await checkHeadersInFirstPosition();
  console.log('All tests passed successfully!');
}

runTests().catch((error) => {
  console.error(`❌ ${error.message}`);
});
