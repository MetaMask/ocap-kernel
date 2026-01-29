import type { Comment } from 'acorn';
import { parse } from 'acorn';
import type { Plugin } from 'vite';

/**
 * Rollup plugin that strips comments from bundled code using AST parsing.
 *
 * SES rejects code containing `import(` patterns, even when they appear
 * in comments. This plugin uses Acorn to definitively identify comment nodes
 * and removes them to avoid triggering that detection.
 *
 * Uses the `renderChunk` hook to process the final output.
 *
 * @returns A Rollup plugin.
 */
export function stripCommentsPlugin(): Plugin {
  return {
    name: 'strip-comments',
    renderChunk(code) {
      const comments: Comment[] = [];

      parse(code, {
        ecmaVersion: 'latest',
        sourceType: 'script',
        onComment: comments,
      });

      if (comments.length === 0) {
        return null;
      }

      // Build result by copying non-comment ranges.
      // Comments are sorted by position since acorn parses linearly.
      let result = '';
      let position = 0;

      for (const comment of comments) {
        result += code.slice(position, comment.start);
        position = comment.end;
      }

      result += code.slice(position);
      return result;
    },
  };
}
