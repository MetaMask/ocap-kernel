// @ts-check

/* eslint-disable no-plusplus */
/* eslint-disable jsdoc/require-returns-type */

/**
 * Quickly removes the normalized scope prefix from a normalized pathname.
 *
 * @param {string} normalizedPathname - The normalized pathname.
 * @param {string} [normalizedScope] - The normalized scope.
 * @returns {string} The scoped path.
 */
const scopedPath = (normalizedPathname, normalizedScope = '') =>
  normalizedPathname.slice(
    normalizedPathname.indexOf(normalizedScope) + normalizedScope.length || 0,
  );

/**
 * Rollup plugin to transform endoScript identifiers.
 *
 * @param {object} [options] - The plugin options.
 * @param {(id: string) => boolean} [options.maybeEndoScript] - A function to determine if the script should be transformed.
 * @param {string} [options.scopedRoot] - The root directory to scope the transformed script.
 * @param {boolean} [options.timing] - Whether to log the transform time.
 * @param {boolean | 'VERBOSE'} [options.debugging] - Whether to log the transform details.
 * @param {boolean} [options.validation] - Whether to validate the transform.
 * @returns The Rollup plugin.
 */
export default function endoScriptIdentifierTransformPlugin({
  maybeEndoScript = undefined,
  scopedRoot = undefined,
  timing = false,
  debugging = false,
  validation = true,
} = {}) {
  const zwjIdentifierMatcher =
    /(?<!\w)\$([hc])\u200d(_{1,4})(\w+\b(?:\$*))+?(?!\w)/gu;
  const cgjIdentifierMatcher =
    /(?<!\w)(?=\$(?:\u034f\$)?\u034f+((?:\w+\b(?:\$*))+?))(?:\$\u034f+(?:\w+\b(?:\$*))+?\u034f\$|\$\u034f\$\u034f+(?:\w+\b(?:\$*))+?)(?!\w)/gu;

  return {
    name: 'endo-script-identifier-transform',
    transform(code, id) {
      if (
        !((maybeEndoScript?.(id) ?? true) && zwjIdentifierMatcher.test(code))
      ) {
        debugging && console.warn(`Skipping transform: ${id}`);
        return null;
      }

      const scopedId = scopedRoot ? scopedPath(id, scopedRoot) : undefined;

      const tag = `transform ${scopedId ?? id}`;

      debugging === 'VERBOSE' && console.info(tag);
      timing && console.time(tag);

      if (cgjIdentifierMatcher.test(code)) {
        throw new Error(
          `Endoify script contains both U+200D and U+034F identifier characters: ${
            scopedId ?? id
          }`,
        );
      }

      const changes =
        validation || debugging
          ? /** @type {Record<number, Record<'match'|'replacement'|'identifier'|'prefix',string> & Record<'length'|'delta',number>>} */ ({})
          : undefined;

      let replacements = 0;

      const replacedCode = code.replace(
        zwjIdentifierMatcher,
        (match, prefix, { length: underscores }, identifier, index) => {
          const replacement =
            prefix === 'h'
              ? `$${'\u034f'.repeat(underscores)}${identifier}\u034f$`
              : `$\u034f$${'\u034f'.repeat(underscores)}${identifier}`;

          if (changes) {
            changes[index] = {
              match,
              replacement,
              identifier,
              prefix,
              length: match.length,
              delta: replacement.length - match.length,
            };
          }

          replacements++;
          return replacement;
        },
      );

      timing && console.timeLog(tag);

      const delta = replacedCode.length - code.length;

      debugging && delta !== 0 && console.warn(`Delta: ${delta} [expected: 0]`);

      if (debugging) {
        debugging === 'VERBOSE' && console.table(changes);
        console.dir(
          { id: scopedId ?? id, replacements, delta },
          {
            depth: debugging === 'VERBOSE' ? 2 : 1,
            maxStringLength: 100,
            compact: true,
          },
        );
      }

      if (delta !== 0) {
        throw new Error(
          `Mismatched lengths: ${code.length} ${delta > 0 ? '<' : '>'} ${
            replacedCode.length
          } in ${scopedId ?? id}`,
        );
      }

      if (changes) {
        let matched = 0;
        for (const match of replacedCode.matchAll(cgjIdentifierMatcher)) {
          if (match[0] !== changes[match.index ?? -1]?.replacement) {
            throw new Error(
              `Mismatched replacement: ${match[0]} !== ${
                changes[match.index ?? -1]?.replacement
              } in ${scopedId ?? id}`,
            );
          }
          if (match[1] !== changes[match.index ?? -1]?.identifier) {
            throw new Error(
              `Mismatched replacement: ${match[1]} !== ${
                changes[match.index ?? -1]?.identifier
              } in ${scopedId ?? id}`,
            );
          }
          matched++;
        }
        if (matched !== replacements) {
          throw new Error(
            `Mismatched replacements: ${matched} !== ${replacements} in ${
              scopedId ?? id
            }`,
          );
        }
      }

      timing && console.timeEnd(tag);

      return {
        code: replacedCode,
        moduleSideEffects: 'no-treeshake',
      };
    },
  };
}

/** @typedef {Exclude<Parameters<typeof endoScriptIdentifierTransformPlugin>[0], undefined>} EndoScriptIdentifierTransformOptions */
