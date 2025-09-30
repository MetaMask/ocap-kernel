import { mergeConfig } from '@ocap/repo-tools/vitest-config';
import { fileURLToPath } from 'node:url';
import { defineConfig, defineProject } from 'vitest/config';

import defaultConfig from '../../vitest.config.ts';

export default defineConfig((args) => {
  return mergeConfig(
    args,
    defaultConfig,
    defineProject({
      test: {
        name: 'kernel',
        setupFiles: [
          // This is actually a circular dependency relationship, but it's fine because we're
          // targeting the TypeScript source file and not listing @ocap/nodejs in package.json.
          fileURLToPath(import.meta.resolve('@ocap/nodejs/endoify-ts')),
        ],
      },
    }),
  );
});
