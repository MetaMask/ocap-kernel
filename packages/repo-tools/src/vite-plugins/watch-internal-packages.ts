import path from 'node:path';
import type { Plugin as VitePlugin } from 'vite';

type Options = {
  rootDir: string;
  packages: string[];
};

/**
 * Vite plugin that watches for changes in internal packages and invalidates the module graph.
 *
 * @param options - The options for the plugin.
 * @param options.rootDir - The absolute path to the monorepo root directory.
 * @param options.packages - The names of the directories containing the packages to watch.
 * @returns The Vite plugin.
 */
export function watchInternalPackages({
  rootDir,
  packages,
}: Options): VitePlugin {
  return {
    name: 'ocap-kernel:watch-internal-packages',
    configureServer(server) {
      for (const packageDirname of packages) {
        server.watcher.add(
          path.resolve(rootDir, `packages/${packageDirname}/dist`),
        );
      }
      server.watcher.on('change', (file) => {
        if (packages.some((pkg) => file.includes(`${pkg}/dist`))) {
          server.moduleGraph.invalidateAll();
        }
      });
    },
  };
}
