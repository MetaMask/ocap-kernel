import { load as loadHtml } from 'cheerio';
import { format as prettierFormat } from 'prettier';
import type { Plugin as VitePlugin } from 'vite';

/**
 * Options for the HTML trusted prelude plugin.
 */
export type HtmlTrustedPreludeOptions = {
  /**
   * Additional prelude scripts to inject BEFORE endoify.js.
   * These are injected as regular scripts (not type="module") so they
   * execute synchronously before any module scripts.
   *
   * Use this for scripts that must run before lockdown, such as
   * console-forwarding-prelude.js for Playwright log capture.
   */
  preludes?: string[];
};

/**
 * Vite plugin to insert trusted prelude scripts before the first script in the head element.
 * Injects optional preludes first, then endoify.js.
 * Assumes that `endoify.js` is located in the root of the web app.
 *
 * @param options - Plugin options.
 * @throws If the HTML document already references the endoify script or lacks the expected
 * structure.
 * @returns The Vite plugin.
 */
export function htmlTrustedPrelude(
  options: HtmlTrustedPreludeOptions = {},
): VitePlugin {
  const { preludes = [] } = options;

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

      if (htmlDoc('head').length !== 1) {
        throw new Error(
          `Expected HTML document with a single <head>. Received:\n${htmlString}`,
        );
      }

      // Build the prelude elements: additional preludes first, then endoify
      // Preludes are regular scripts (not modules) so they execute synchronously
      const preludeElements = preludes.map(
        (src) => `<script src="${src}"></script>`,
      );
      const endoifyElement = `<script src="/endoify.js" type="module"></script>`;
      const allElements = [...preludeElements, endoifyElement].join('\n');

      if (htmlDoc('head > script').length >= 1) {
        htmlDoc(allElements).insertBefore('head:first script:first');
      } else {
        htmlDoc(allElements).appendTo('head:first');
      }

      return await prettierFormat(htmlDoc.html(), {
        parser: 'html',
        tabWidth: 2,
      });
    },
  };
}
