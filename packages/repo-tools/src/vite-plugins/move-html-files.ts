import path from 'node:path';
import type { Plugin as VitePlugin } from 'vite';

/**
 * Vite plugin that moves HTML files to the root of the bundle.
 *
 * @returns The Vite plugin.
 */
export function moveHtmlFilesToRoot(): VitePlugin {
  return {
    name: 'ocap-kernel:move-html-files-to-root',
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        for (const chunk of Object.values(bundle)) {
          if (!chunk.fileName.endsWith('.html')) {
            continue;
          }
          chunk.fileName = path.basename(chunk.fileName);
        }
      },
    },
  };
}
