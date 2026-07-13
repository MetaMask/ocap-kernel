import type { Provision } from '@metamask/kernel-utils/session';
import { describe, expect, it } from 'vitest';

import {
  escapeControlCharsInStrings,
  extractStringFields,
  formatExpandedContent,
  formatProvisionCompact,
  formatTime,
  parseDescription,
  splitShellCommand,
  tryParseJsonObject,
} from './format.ts';

describe('formatTime', () => {
  it.each([
    ['2026-01-02T03:04:05.000Z', /^\d{2}:\d{2}:\d{2}$/u],
    ['2026-12-31T23:59:59.000Z', /^\d{2}:\d{2}:\d{2}$/u],
  ])('renders ISO %s as HH:mm:ss', (iso, pattern) => {
    expect(formatTime(iso)).toMatch(pattern);
  });

  it('pads single-digit fields with zero', () => {
    // Construct a Date in the local zone so we can predict the output.
    const date = new Date(2026, 0, 1, 3, 4, 5);
    expect(formatTime(date.toISOString())).toBe('03:04:05');
  });
});

describe('splitShellCommand', () => {
  it.each<[string, string[]]>([
    ['ls -la', ['ls -la']],
    ['ls && cd /tmp', ['ls', '&& cd /tmp']],
    ['git log | head', ['git log', '| head']],
    ['echo a ; echo b', ['echo a', '; echo b']],
    [
      'git log --oneline | head -10 && echo done',
      ['git log --oneline', '| head -10', '&& echo done'],
    ],
    ['true || false', ['true || false']],
  ])('splits %s into segments', (command, expected) => {
    expect(splitShellCommand(command)).toStrictEqual(expected);
  });

  it('returns empty array for empty input', () => {
    expect(splitShellCommand('')).toStrictEqual([]);
  });
});

describe('tryParseJsonObject', () => {
  it('parses a valid object literal', () => {
    expect(tryParseJsonObject('{"a":1,"b":"x"}')).toStrictEqual({
      a: 1,
      b: 'x',
    });
  });

  it.each<[string]>([['[1,2,3]'], ['"hello"'], ['42'], ['null'], ['not json']])(
    'returns null for non-object input %s',
    (input) => {
      expect(tryParseJsonObject(input)).toBeNull();
    },
  );
});

describe('escapeControlCharsInStrings', () => {
  it('escapes newlines inside string values', () => {
    expect(escapeControlCharsInStrings('{"a":"line1\nline2"}')).toBe(
      '{"a":"line1\\nline2"}',
    );
  });

  it('escapes tabs and CR inside string values', () => {
    expect(escapeControlCharsInStrings('{"a":"x\ty\rz"}')).toBe(
      '{"a":"x\\ty\\rz"}',
    );
  });

  it('preserves structural whitespace outside strings', () => {
    const input = '{\n  "a": "ok"\n}';
    expect(escapeControlCharsInStrings(input)).toBe(input);
  });

  it('leaves existing backslash escapes alone', () => {
    expect(escapeControlCharsInStrings('{"a":"\\nliteral"}')).toBe(
      '{"a":"\\nliteral"}',
    );
  });
});

describe('parseDescription', () => {
  it('parses a Bash invocation with a JSON body', () => {
    const result = parseDescription(
      'Allow Bash({"command":"ls -la","description":"list"})',
    );
    expect(result).toStrictEqual({
      label: 'Allow Bash',
      params: { command: 'ls -la', description: 'list' },
    });
  });

  it('parses a Read invocation', () => {
    const result = parseDescription('Allow Read({"file_path":"/tmp/foo.txt"})');
    expect(result).toStrictEqual({
      label: 'Allow Read',
      params: { file_path: '/tmp/foo.txt' },
    });
  });

  it('parses an Edit invocation', () => {
    const result = parseDescription(
      'Allow Edit({"file_path":"/x","old_string":"a","new_string":"b"})',
    );
    expect(result).toStrictEqual({
      label: 'Allow Edit',
      params: { file_path: '/x', old_string: 'a', new_string: 'b' },
    });
  });

  it('returns null params when no parens are present', () => {
    expect(parseDescription('Just a label')).toStrictEqual({
      label: 'Just a label',
      params: null,
    });
  });

  it('preserves the label even when JSON parse fails', () => {
    expect(parseDescription('Allow Bash({not json})')).toStrictEqual({
      label: 'Allow Bash',
      params: null,
    });
  });

  it('retries via control-char escaping when JSON contains literal newlines', () => {
    const result = parseDescription('Allow Bash({"command":"a\nb"})');
    expect(result).toStrictEqual({
      label: 'Allow Bash',
      params: { command: 'a\nb' },
    });
  });

  it('returns null params when the closing paren is missing', () => {
    expect(parseDescription('Allow Bash({"command":"x"}')).toStrictEqual({
      label: 'Allow Bash',
      params: null,
    });
  });
});

describe('extractStringFields', () => {
  it('extracts top-level string fields', () => {
    expect(
      extractStringFields('{"command":"ls -la","description":"list"}'),
    ).toStrictEqual([
      ['command', 'ls -la'],
      ['description', 'list'],
    ]);
  });

  it('decodes common escape sequences in values', () => {
    expect(extractStringFields('{"x":"a\\nb\\tc\\rd"}')).toStrictEqual([
      ['x', 'a\nb\tc\rd'],
    ]);
  });

  it('skips non-string fields', () => {
    expect(extractStringFields('{"n":42,"s":"hi"}')).toStrictEqual([
      ['s', 'hi'],
    ]);
  });

  it('returns null when input is not object-shaped', () => {
    expect(extractStringFields('[1,2,3]')).toBeNull();
  });

  it('returns null when no string fields are found', () => {
    expect(extractStringFields('{"n":42}')).toBeNull();
  });
});

describe('formatProvisionCompact', () => {
  it('formats a single-invocation provision', () => {
    const provision: Provision = {
      tool: 'Bash',
      patterns: [
        {
          name: 'ls',
          argPatterns: [{ kind: 'exact', value: '-la' }],
        },
      ],
    };
    expect(formatProvisionCompact(provision)).toBe('ls -la');
  });

  it('joins a pipeline with ` | `', () => {
    const provision: Provision = {
      tool: 'Bash',
      patterns: [
        {
          name: 'git',
          argPatterns: [{ kind: 'exact', value: 'log' }, { kind: 'wildcard' }],
        },
        {
          name: 'head',
          argPatterns: [{ kind: 'wildcard' }],
        },
      ],
    };
    expect(formatProvisionCompact(provision)).toBe('git log * | head *');
  });

  it('renders prefix patterns with a trailing star', () => {
    const provision: Provision = {
      tool: 'Read',
      patterns: [
        {
          name: 'Read',
          argPatterns: [{ kind: 'prefix', prefix: '/tmp/' }],
        },
      ],
    };
    expect(formatProvisionCompact(provision)).toBe('Read /tmp/*');
  });
});

describe('formatExpandedContent', () => {
  it('splits a Bash command on shell operators', () => {
    const description = 'Allow Bash({"command":"ls && cd /tmp"})';
    expect(formatExpandedContent(description)).toBe('ls\n&& cd /tmp');
  });

  it('splits a Bash command on newlines when present', () => {
    const description = 'Allow Bash({"command":"line1\\nline2"})';
    expect(formatExpandedContent(description)).toBe('line1\nline2');
  });

  it('renders generic tools as key: value lines', () => {
    const description = 'Allow Read({"file_path":"/x","limit":50})';
    expect(formatExpandedContent(description)).toBe('file_path: /x\nlimit: 50');
  });

  it('truncates very long string values with an ellipsis', () => {
    const longValue = 'a'.repeat(250);
    const description = `Allow Read({"file_path":"${longValue}"})`;
    const output = formatExpandedContent(description);
    expect(output.startsWith('file_path: ')).toBe(true);
    expect(output.endsWith('…')).toBe(true);
    expect(output.length).toBeLessThan(longValue.length + 'file_path: '.length);
  });

  it('truncates long Bash segments independently', () => {
    const longSegment = 'a'.repeat(250);
    const description = `Allow Bash({"command":"${longSegment} && ls"})`;
    const output = formatExpandedContent(description);
    const [first, second] = output.split('\n');
    expect(first?.endsWith('…')).toBe(true);
    expect(second).toBe('&& ls');
  });

  it('falls back to extractStringFields when JSON parsing fails', () => {
    // Description with an unescaped quote inside the value — outer JSON fails.
    const description = 'Allow Bash({"command":"echo "hi""})';
    const output = formatExpandedContent(description);
    expect(output).toContain('echo');
  });

  it('returns the raw description when no parens are present', () => {
    expect(formatExpandedContent('hello world')).toBe('hello world');
  });
});
