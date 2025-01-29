import * as fs from 'node:fs';
import { Far } from '@endo/marshal';

// The filepath to read.
const DEFAULT_FILEPATH = './data.json';

/**
 * Build function for the LLM test vat.
 *
 * @param {unknown} _vatPowers - Special powers granted to this vat (not used here).
 * @param {unknown} parameters - Initialization parameters from the vat's config object.
 * @param {unknown} _baggage - Root of vat's persistent state (not used here).
 * @returns {unknown} The root object for the new vat.
 */
export function buildRootObject(_vatPowers, parameters, _baggage) {
  const filepath = parameters?.filepath ?? DEFAULT_FILEPATH;
  console.log(`buildRootObject "${filepath}"`);

  return Far('root', {
    async bootstrap() {
      console.log(`bootstrap readFile: ${filepath}`);
    },
    read() {
      const content = fs.readFileSync(__dirname + '/file.txt');
      console.log(content);
      return content;
    },
  });
}

