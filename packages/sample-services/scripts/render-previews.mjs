/**
 * Render each master-svg* template with a fixed set of sample token
 * values and write the result to `<name>.preview.svg` next to the
 * source. Lets the maintainer open the file in a browser to review
 * the artifact a service vat would produce — without needing to
 * stand up the full kernel + matcher + agent stack.
 *
 * Re-run from the package root after editing any master SVG:
 *   node scripts/render-previews.mjs
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolvePath(HERE, '..');

const TARGETS = [
  {
    source: 'src/industrial-design/master-svg.ts',
    output: 'src/industrial-design/master-svg.preview.svg',
    exportName: 'MASTER_SVG',
    tokens: {
      revLabel: 'A1',
      providerLabel: 'industrial-design-stub',
      screenTime: '20:34',
      batteryLifeMonths: '18 mo',
      irProtocols: 'NEC + RC-5 + Sony',
    },
  },
  {
    source: 'src/industrial-design/master-svg-rev2.ts',
    output: 'src/industrial-design/master-svg-rev2.preview.svg',
    exportName: 'MASTER_SVG_REV2',
    tokens: {
      revLabel: 'A2',
      providerLabel: 'industrial-design-stub',
      screenTime: '20:34',
      batteryLifeMonths: '18 mo',
      irProtocols: 'NEC + RC-5 + Sony',
    },
  },
  {
    source: 'src/mechanical-design/master-svg.ts',
    output: 'src/mechanical-design/master-svg.preview.svg',
    exportName: 'MASTER_SVG',
    tokens: {
      revLabel: 'M1',
      providerLabel: 'nantucket-mech',
      colorway: 'charcoal',
    },
  },
  {
    source: 'src/schematic-generation/master-svg.ts',
    output: 'src/schematic-generation/master-svg.preview.svg',
    exportName: 'MASTER_SVG',
    tokens: {
      revLabel: 'E1',
      providerLabel: 'circuit-foundry',
      mcuPartNumber: 'nRF52833-QIAA',
      ldoPartNumber: 'MIC5219-3.0YM5',
    },
  },
  {
    source: 'src/pcb-layout/master-svg.ts',
    output: 'src/pcb-layout/master-svg.preview.svg',
    exportName: 'MASTER_SVG',
    tokens: {
      revLabel: 'P1',
      providerLabel: 'pcb-foundry-compact',
    },
  },
];

/**
 * Extract the SVG template literal from a master-svg*.ts file. The
 * convention across all templates is:
 *   export const <NAME> = `<svg ...> … </svg>`;
 * — so we slice between the opening backtick after `export const
 * <NAME> =` and the matching closing backtick.
 *
 * @param {string} source - The TypeScript source contents.
 * @param {string} exportName - The exported constant name to extract.
 * @returns {string} The raw SVG string.
 */
function extractTemplate(source, exportName) {
  const needle = `export const ${exportName} = \``;
  const start = source.indexOf(needle);
  if (start === -1) {
    throw new Error(`couldn't find export ${exportName}`);
  }
  const openBacktick = start + needle.length - 1;
  // Find the closing backtick that ends the template literal. Master
  // files don't use nested template literals or escaped backticks, so
  // a naïve search for the next unescaped backtick is enough.
  let i = openBacktick + 1;
  while (i < source.length) {
    if (source[i] === '`' && source[i - 1] !== '\\') {
      return source.slice(openBacktick + 1, i);
    }
    i += 1;
  }
  throw new Error(`unterminated template for export ${exportName}`);
}

/**
 * Replace `{{token}}` placeholders in the SVG with the supplied
 * values. Unknown tokens are left as-is.
 *
 * @param {string} svg - The SVG template.
 * @param {Record<string, string>} tokens - Token map.
 * @returns {string} The rendered SVG.
 */
function fillTokens(svg, tokens) {
  return svg.replace(/\{\{(\w+)\}\}/gu, (match, name) =>
    name in tokens ? tokens[name] : match,
  );
}

for (const target of TARGETS) {
  const sourcePath = resolvePath(PKG, target.source);
  const outputPath = resolvePath(PKG, target.output);
  const source = await readFile(sourcePath, 'utf8');
  const template = extractTemplate(source, target.exportName);
  const rendered = fillTokens(template, target.tokens);
  await writeFile(outputPath, rendered, 'utf8');

  console.log(`Wrote ${target.output}`);
}
