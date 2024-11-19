import path from 'path';
import { defineConfig, defineProject, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config.js';
import defaultConfig from '../../vitest.config.js';

export default defineConfig((configEnv) => {
  const config = mergeConfig(
    viteConfig(configEnv),
    mergeConfig(
      defaultConfig,
      defineProject({
        test: {
          name: 'extension',
          pool: 'vmThreads',
          alias: [
            {
              find: '@ocap/shims/endoify',
              replacement: path.resolve('../shims/src/endoify.js'),
              customResolver: (id) => ({ external: true, id }),
            },
          ],
        },
      }),
    ),
  );

  delete config.test.coverage.thresholds;
  return config;
});
