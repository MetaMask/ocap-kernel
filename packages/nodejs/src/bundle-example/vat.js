import { Far } from '@endo/marshal';
import { getContent } from './lib.mjs';

/**
 * Build function for the vat.
 *
 * @param {unknown} parameters - Initialization parameters from the vat's config object.
 * @returns {unknown} The root object for the new vat.
 */
export function buildRootObject(parameters) {
  const filepath = parameters?.filepath ?? 'data.json';
  console.log('buildRootObject', filepath);

  let content;

  return Far('root', {
    async bootstrap() {
      content = await getContent(filepath);
      console.log('bootstrap', filepath);
    },
    read() {
      console.log(content);
      return content;
    },
  });
}
