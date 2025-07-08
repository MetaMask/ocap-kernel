import { load as loadHtml } from 'cheerio';
import { format as prettierFormat } from 'prettier';
import type { Plugin as VitePlugin } from 'vite';

/**
 * Vite plugin to insert the endoify script before the first script in the head element.
 * Assumes that `endoify.js` is located in the root of the web app.
 *
 * @throws If the HTML document already references the endoify script or lacks the expected
 * structure.
 * @returns The Vite plugin.
 */
export function htmlTrustedPrelude(): VitePlugin {
  return {
    name: 'ocap-kernel:html-trusted-prelude',
    async transformIndexHtml(htmlString): Promise<string> {
      const htmlDoc = loadHtml(htmlString);

      if (htmlDoc('script[src="endoify.ts"]').length > 0) {
        throw new Error(
          `HTML document should not reference "endoify.ts" directly:\n${htmlString}`,
        );
      }

      if (htmlDoc('script[src*="endoify.js"]').length > 0) {
        throw new Error(
          `HTML document already references endoify script:\n${htmlString}`,
        );
      }

      if (htmlDoc('head').length !== 1 || htmlDoc('head > script').length < 1) {
        throw new Error(
          `Expected HTML document with a single <head> containing at least one <script>. Received:\n${htmlString}`,
        );
      }

      const endoifyElement = `<script src="/endoify.js" type="module"></script>`;
      htmlDoc(endoifyElement).insertBefore('head:first script:first');

      return await prettierFormat(htmlDoc.html(), {
        parser: 'html',
        tabWidth: 2,
      });
    },
  };
}
