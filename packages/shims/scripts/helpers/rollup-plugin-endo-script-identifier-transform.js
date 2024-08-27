/* eslint-disable jsdoc/require-returns-type */
/* eslint-disable spaced-comment */
/* eslint-disable jsdoc/valid-types */
/* eslint-disable no-plusplus */

/**
 * Quickly removes the normalized scope prefix from a normalized pathname.
 *
 * @param {string} normalizedPathname - The normalized pathname.
 * @param {string} [normalizedScope] - The normalized scope.
 * @returns {string} The scoped path.
 */
const scopedPath = (normalizedPathname, normalizedScope = '') =>
  normalizedPathname.slice(
    normalizedPathname.indexOf(normalizedScope) + normalizedScope.length + 1 ||
      0,
  );

/**
 * Rollup plugin to transform endoScript identifiers.
 *
 * @param {object} [options] - The plugin options.
 * @param {(id: string) => boolean} [options.maybeEndoScript] - A function to determine if the script should be transformed.
 * @param {string} [options.scopedRoot] - The root directory to scope the transformed script.
 * @param {boolean} [options.timing] - Whether to log the transform time.
 * @param {boolean} [options.debugging] - Whether to log the transform details.
 * @param {boolean} [options.validation] - Whether to validate the transform.
 * @returns The Rollup plugin.
 */
export default function endoScriptIdentifierTransformPlugin({
  maybeEndoScript,
  scopedRoot,
  timing = false,
  debugging = false,
  validation = false,
}) {
  const zwjIdentifierMatcher =
    /(?<!\w)\$h\u200d(_{1,4})(\w+\b(?:\$*))+?(?!\w)/gu;
  const cgjIdentifierMatcher =
    /(?<!\w)\$\u034f+(\w+\b(?:\$*))+?\u034f\$(?!\w)/gu;
  return {
    name: 'endo-script-identifier-transform',
    transform(code, id) {
      if (
        !((maybeEndoScript?.(id) ?? true) && zwjIdentifierMatcher.test(code))
      ) {
        return null;
      }

      const scopedId = scopedPath(id, scopedRoot);

      if (cgjIdentifierMatcher.test(code)) {
        throw new Error(
          `Endoify script contains both U+200D and U+034F identifier characters: ${scopedId}`,
        );
      }

      if (timing) {
        console.time(`transform ${scopedId}`);
      }

      const records = validation ? {} : undefined;
      let replacements = 0;

      const replacedCode = code.replace(
        zwjIdentifierMatcher,
        (match, underscores, identifier, index) => {
          const replacement = `$${'\u034f'.repeat(
            underscores.length,
          )}${identifier}\u034f$`;

          if (validation) {
            records[index] = { match, replacement, identifier };
          }

          replacements++;
          return replacement;
        },
      );

      if (validation) {
        for (const match of replacedCode.matchAll(cgjIdentifierMatcher)) {
          if (match[0] !== records[match.index ?? -1]?.replacement) {
            throw new Error(
              `Mismatched replacement: ${match[0]} !== ${
                records[match.index ?? -1]?.replacement
              }`,
            );
          }
          if (match[1] !== records[match.index ?? -1]?.identifier) {
            throw new Error(
              `Mismatched replacement: ${match[1]} !== ${
                records[match.index ?? -1]?.identifier
              }`,
            );
          }
        }
      }

      if (timing) {
        console.timeEnd(`transform ${scopedId}`);
      }

      if (debugging) {
        console.dir(
          {
            transform: {
              id: scopedId,
              replacements,
              delta: replacedCode.length - code.length,
            },
          },
          { depth: 1, maxStringLength: 100, compact: true },
        );
      }

      return {
        code: replacedCode,
        moduleSideEffects: 'no-treeshake',
      };
    },
  };
}
