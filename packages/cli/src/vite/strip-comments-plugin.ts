import type { Plugin } from 'rollup';

/**
 * Rollup plugin that strips comments from bundled code.
 *
 * SES rejects code containing `import(` patterns, even when they appear
 * in comments. This plugin removes all comments to avoid triggering
 * that detection.
 *
 * Uses the `renderChunk` hook to process the final output.
 *
 * @returns A Rollup plugin.
 */
export function stripCommentsPlugin(): Plugin {
  return {
    name: 'strip-comments',
    renderChunk(code) {
      // Remove single-line comments (// ...)
      // Remove multi-line comments (/* ... */)
      // Be careful not to remove comments inside strings
      let result = '';
      let i = 0;
      while (i < code.length) {
        const char = code[i] as string;
        const nextChar = code[i + 1];

        // Check for string literals
        if (char === '"' || char === "'" || char === '`') {
          const quote = char;
          result += quote;
          i += 1;
          // Copy string content including escape sequences
          while (i < code.length) {
            const strChar = code[i] as string;
            if (strChar === '\\' && i + 1 < code.length) {
              result += strChar + (code[i + 1] as string);
              i += 2;
            } else if (strChar === quote) {
              result += quote;
              i += 1;
              break;
            } else {
              result += strChar;
              i += 1;
            }
          }
        }
        // Check for single-line comment
        else if (char === '/' && nextChar === '/') {
          // Skip until end of line
          while (i < code.length && code[i] !== '\n') {
            i += 1;
          }
        }
        // Check for multi-line comment
        else if (char === '/' && nextChar === '*') {
          i += 2;
          // Skip until */
          while (i < code.length && !(code[i - 1] === '*' && code[i] === '/')) {
            i += 1;
          }
          i += 1; // Skip the closing /
        }
        // Regular character
        else {
          result += char;
          i += 1;
        }
      }
      return result;
    },
  };
}
