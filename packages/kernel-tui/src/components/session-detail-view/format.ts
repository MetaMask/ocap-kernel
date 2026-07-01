import type { Provision } from '@metamask/kernel-utils/session';
import { argPatternDisplay } from '@metamask/kernel-utils/session';

export type ParsedDescription = {
  /** The part before the opening `(`, e.g. `"Allow Bash"`. */
  label: string;
  /** The JSON object parsed from inside the parens, or `null` if absent/unparseable. */
  params: Record<string, unknown> | null;
};

export const MAX_STRING_LENGTH = 200;

/**
 * Format an ISO timestamp as `HH:mm:ss`.
 *
 * @param iso - ISO 8601 string.
 * @returns Formatted time string.
 */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

/**
 * Split a shell command string on ` && `, ` | `, and ` ; ` into segments,
 * keeping each operator as a prefix on its following segment so the parts
 * can be rendered as a list.
 *
 * @param command - The raw shell command string.
 * @returns Array of segments, e.g. `['cmd1', '&& cmd2', '| cmd3']`.
 */
export function splitShellCommand(command: string): string[] {
  const operatorPattern = / (&&|\|(?!\|)|;) /gu;
  const parts: string[] = [];
  let lastCut = 0;
  let match: RegExpExecArray | null;
  while ((match = operatorPattern.exec(command)) !== null) {
    parts.push(command.slice(lastCut, match.index).trim());
    lastCut = match.index + 1; // operator starts right after the leading space
  }
  parts.push(command.slice(lastCut).trim());
  return parts.filter(Boolean);
}

/**
 * Attempt to parse a string as a JSON object (not an array or primitive).
 *
 * @param str - String to parse.
 * @returns The parsed object, or `null` if parsing fails or the result is not a plain object.
 */
export function tryParseJsonObject(
  str: string,
): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(str);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Escape literal control characters (newlines, tabs, etc.) that appear inside
 * JSON string values, while leaving structural whitespace outside strings
 * untouched.  A bare `replace(/[\x00-\x1f]/g, …)` would corrupt structural
 * whitespace in pretty-printed JSON, making it unparseable.
 *
 * @param str - Raw params string, potentially with unescaped control chars.
 * @returns String with control chars inside JSON strings properly escaped.
 */
export function escapeControlCharsInStrings(str: string): string {
  let out = '';
  let inString = false;
  let i = 0;
  while (i < str.length) {
    const ch = str[i];
    if (ch === '\\' && inString) {
      // Consume the escape sequence as-is.
      out += ch;
      i += 1;
      if (i < str.length) {
        out += str[i];
        i += 1;
      }
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      out += ch;
      i += 1;
      continue;
    }
    if (inString && ch !== undefined) {
      const code = ch.charCodeAt(0);
      if (code < 32) {
        if (ch === '\n') {
          out += '\\n';
        } else if (ch === '\r') {
          out += '\\r';
        } else if (ch === '\t') {
          out += '\\t';
        } else {
          out += `\\u${code.toString(16).padStart(4, '0')}`;
        }
        i += 1;
        continue;
      }
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Split a description of the form `Label({...json...})` into a short label and
 * a params object. Extracts the label even when JSON parsing fails.
 *
 * @param description - Raw entry description string.
 * @returns Parsed label and params.
 */
export function parseDescription(description: string): ParsedDescription {
  const parenIdx = description.indexOf('(');
  if (parenIdx === -1) {
    return { label: description, params: null };
  }
  // Always extract the label before `(`, even if JSON parsing below fails.
  const label = description.slice(0, parenIdx).trim();
  if (!description.endsWith(')')) {
    return { label, params: null };
  }
  const paramsStr = description.slice(parenIdx + 1, -1);

  // Fast path: properly encoded JSON (compact or pretty-printed with valid whitespace).
  const direct = tryParseJsonObject(paramsStr);
  if (direct !== null) {
    return { label, params: direct };
  }

  // Slow path: escape literal control chars inside string values only, then retry.
  const fallback = tryParseJsonObject(escapeControlCharsInStrings(paramsStr));
  return { label, params: fallback };
}

/**
 * Render a Provision as a compact one-liner, e.g. `git log --oneline * | head *`.
 *
 * @param provision - The provision to format.
 * @returns Compact string representation.
 */
export function formatProvisionCompact(provision: Provision): string {
  return provision.patterns
    .map((patt) =>
      [patt.name, ...patt.argPatterns.map(argPatternDisplay)].join(' '),
    )
    .join(' | ');
}

/**
 * Extract top-level string-valued fields from a potentially-invalid JSON object
 * string. Useful when the outer JSON fails to parse (e.g. due to unescaped
 * double quotes inside a string value). Non-string fields are skipped.
 *
 * @param raw - Raw params string, e.g. `{"cmd":"...","desc":"..."}`.
 * @returns `[key, value]` pairs found, or `null` if the input is not object-shaped.
 */
export function extractStringFields(raw: string): [string, string][] | null {
  if (!raw.startsWith('{')) {
    return null;
  }
  const fields: [string, string][] = [];
  // Match: "key" : " (opening of a string value; skips non-string fields)
  const keyRegex = /"([^"\\]+)"\s*:\s*"/gu;
  let match: RegExpExecArray | null;
  while ((match = keyRegex.exec(raw)) !== null) {
    const key = match[1];
    if (key === undefined) {
      continue;
    }
    let value = '';
    let idx = keyRegex.lastIndex;
    while (idx < raw.length) {
      const ch = raw[idx];
      if (ch === '\\') {
        idx += 1;
        const next = raw[idx];
        if (next === 'n') {
          value += '\n';
        } else if (next === 't') {
          value += '\t';
        } else if (next === 'r') {
          value += '\r';
        } else if (next !== undefined) {
          value += next;
        }
        idx += 1;
      } else if (ch === '"') {
        idx += 1;
        break;
      } else if (ch === undefined) {
        break;
      } else {
        value += ch;
        idx += 1;
      }
    }
    keyRegex.lastIndex = idx;
    fields.push([key, value]);
  }
  return fields.length > 0 ? fields : null;
}

/**
 * Format an entry description as compact plain text suitable for inline display.
 *
 * For Bash entries: shows just the command, split into one line per shell
 * operator segment (or per heredoc line) so the terminal stays readable.
 * For all other entries: shows `key: value` pairs, one per line.
 * Falls back to truncated raw params when JSON parsing and lenient extraction
 * both fail.
 *
 * @param description - The raw description string from the history entry or pending request.
 * @returns Newline-separated string for display.
 */
export function formatExpandedContent(description: string): string {
  const { label, params } = parseDescription(description);

  // Extract the raw params string (content inside the outer parens).
  const parenIdx = description.indexOf('(');
  const raw =
    parenIdx !== -1 && description.endsWith(')')
      ? description.slice(parenIdx + 1, -1)
      : description;

  // Resolve the best available field set: parsed JSON first, lenient extraction second.
  let fields: Record<string, unknown> | null = params;
  if (fields === null) {
    const extracted = extractStringFields(raw);
    if (extracted !== null) {
      fields = Object.fromEntries(extracted);
    }
  }

  if (fields === null) {
    // Last resort: truncated raw string
    return raw.length > MAX_STRING_LENGTH * 2
      ? `${raw.slice(0, MAX_STRING_LENGTH * 2)}…`
      : raw;
  }

  // For Bash: show only the command, split into readable segments.
  // Split BEFORE truncating so each segment is limited independently —
  // a long command with short segments must not be cut mid-segment.
  if (label.includes('Bash') && typeof fields.command === 'string') {
    const segments = fields.command.includes('\n')
      ? fields.command.split('\n').filter(Boolean)
      : splitShellCommand(fields.command);
    return segments
      .map((segment) =>
        segment.length > MAX_STRING_LENGTH
          ? `${segment.slice(0, MAX_STRING_LENGTH)}…`
          : segment,
      )
      .join('\n');
  }

  // Generic: compact `key: value` pairs, one per line.
  return Object.entries(fields)
    .map(([key, value]) => {
      if (typeof value === 'string') {
        const truncated =
          value.length > MAX_STRING_LENGTH
            ? `${value.slice(0, MAX_STRING_LENGTH)}…`
            : value;
        return `${key}: ${truncated}`;
      }
      const json = JSON.stringify(value);
      const truncated =
        json.length > MAX_STRING_LENGTH
          ? `${json.slice(0, MAX_STRING_LENGTH)}…`
          : json;
      return `${key}: ${truncated}`;
    })
    .join('\n');
}
