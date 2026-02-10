import type { LogEntry } from './types.ts';

/**
 * Checks whether a log entry has tags that should be rendered,
 * given the transport's `tags` option.
 *
 * @param includeTags - The transport's `tags` option value.
 * @param entry - The log entry to check.
 * @returns `true` if the entry has tags and the option is enabled.
 */
export function hasTags(includeTags: boolean, entry: LogEntry): boolean {
  return includeTags && entry.tags.length > 0;
}

/**
 * Formats an entry's tags as a bracketed string prefix, e.g. `"[cli, daemon] "`.
 * Returns an empty string if tags should not be rendered.
 *
 * @param includeTags - The transport's `tags` option value.
 * @param entry - The log entry whose tags to format.
 * @returns The formatted tag prefix or `""`.
 */
export function formatTagPrefix(includeTags: boolean, entry: LogEntry): string {
  return hasTags(includeTags, entry) ? `[${entry.tags.join(', ')}] ` : '';
}
