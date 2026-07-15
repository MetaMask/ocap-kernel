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

// `providerLabel` per target is resolved from the corresponding
// service.ts at run time (see `extractStringConstant`) so the previews
// track provider-tag renames without manual updates here.
const TARGETS = [
  {
    source: 'src/industrial-design/master-svg.ts',
    output: 'src/industrial-design/master-svg.preview.svg',
    exportName: 'MASTER_SVG',
    providerTag: {
      source: 'src/industrial-design/service.ts',
      constant: 'INDUSTRIAL_DESIGN_PROVIDER_TAG',
    },
    tokens: {
      revLabel: 'A1',
      screenTime: '20:34',
      batteryLifeMonths: '18 mo',
      irProtocols: 'NEC + RC-5 + Sony',
    },
  },
  {
    source: 'src/industrial-design/master-svg-rev2.ts',
    output: 'src/industrial-design/master-svg-rev2.preview.svg',
    exportName: 'MASTER_SVG_REV2',
    providerTag: {
      source: 'src/industrial-design/service.ts',
      constant: 'INDUSTRIAL_DESIGN_PROVIDER_TAG',
    },
    tokens: {
      revLabel: 'A2',
      screenTime: '20:34',
      batteryLifeMonths: '18 mo',
      irProtocols: 'NEC + RC-5 + Sony',
    },
  },
  {
    source: 'src/mechanical-design/master-svg.ts',
    output: 'src/mechanical-design/master-svg.preview.svg',
    exportName: 'MASTER_SVG',
    providerTag: {
      source: 'src/mechanical-design/service.ts',
      constant: 'MECHANICAL_DESIGN_PROVIDER_TAG',
    },
    // Mirror the locked soft-white colorway from template.ts so the
    // preview matches what the service vat actually emits.
    tokens: {
      revLabel: 'M1',
      colorwayName: 'soft white',
      caseColorHighlight: '#f8f6f1',
      caseColorMain: '#ecebe5',
      caseColorShadow: '#c4c2bc',
      caseColorDeepShadow: '#9c9a93',
    },
  },
  {
    source: 'src/schematic-generation/master-svg.ts',
    output: 'src/schematic-generation/master-svg.preview.svg',
    exportName: 'MASTER_SVG',
    providerTag: {
      source: 'src/schematic-generation/service.ts',
      constant: 'SCHEMATIC_GENERATION_PROVIDER_TAG',
    },
    // mcuPartNumber matches the lock in src/schematic-generation/template.ts.
    tokens: {
      revLabel: 'E1',
      mcuPartNumber: 'ESP32-S3-MINI-N8',
      ldoPartNumber: 'MIC5219-3.0YM5',
    },
  },
  {
    source: 'src/pcb-layout/master-svg.ts',
    output: 'src/pcb-layout/master-svg.preview.svg',
    exportName: 'MASTER_SVG',
    providerTag: {
      source: 'src/pcb-layout/service.ts',
      constant: 'PCB_LAYOUT_PROVIDER_TAG',
    },
    // Mirror the production token set so the preview reflects what a
    // generate() call actually emits (without the per-call randomness).
    tokens: {
      revLabel: 'P1',
      boardColor: '#0d6e3a',
      boardSize: '46 × 102 mm',
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
 * Extract the value of an exported single-quoted string constant
 * from a .ts file. Matches the prettier-wrapped form:
 *   export const FOO = 'value';
 * or
 *   export const FOO =
 *     'value';
 * — but doesn't try to handle string concatenation or interpolation.
 *
 * @param {string} source - The TypeScript source contents.
 * @param {string} exportName - The exported constant name.
 * @returns {string} The string literal's value.
 */
function extractStringConstant(source, exportName) {
  const pattern = new RegExp(
    `export\\s+const\\s+${exportName}\\s*=\\s*'([^']*)'\\s*;`,
    'u',
  );
  const match = source.match(pattern);
  if (match === null) {
    throw new Error(`couldn't find single-quoted string export ${exportName}`);
  }
  return match[1];
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

  const providerSourcePath = resolvePath(PKG, target.providerTag.source);
  const providerSource = await readFile(providerSourcePath, 'utf8');
  const providerLabel = extractStringConstant(
    providerSource,
    target.providerTag.constant,
  );

  const rendered = fillTokens(template, {
    ...target.tokens,
    providerLabel,
  });
  await writeFile(outputPath, rendered, 'utf8');

  console.log(`Wrote ${target.output}`);
}
