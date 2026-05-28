import { describe, expect, it } from 'vitest';

import { decompose } from './bash.ts';

describe('decompose', () => {
  describe('empty input', () => {
    it('returns empty for empty string', () => {
      expect(decompose('')).toStrictEqual({
        ok: false,
        reason: 'empty',
        clauses: [],
      });
    });

    it('returns empty for whitespace-only string', () => {
      expect(decompose('   \n  ')).toStrictEqual({
        ok: false,
        reason: 'empty',
        clauses: [],
      });
    });
  });

  describe('command names', () => {
    it('extracts a bare command name', () => {
      const result = decompose('ls');
      expect(result).toStrictEqual({
        ok: true,
        clauses: [
          [{ name: 'ls', argv: [], pipePosition: 'alone', redirects: [] }],
        ],
      });
    });

    it('marks a variable-expanded command name as dynamic_command', () => {
      expect(decompose('$CMD arg')).toHaveProperty('reason', 'dynamic_command');
    });
  });

  describe('argument extraction', () => {
    it('collects positional arguments', () => {
      const result = decompose('ls -la /tmp');
      expect(result.ok).toBe(true);
      expect(result.clauses[0]?.[0]).toStrictEqual({
        name: 'ls',
        argv: ['-la', '/tmp'],
        pipePosition: 'alone',
        redirects: [],
      });
    });

    it('strips double quotes from string arguments', () => {
      const result = decompose('echo "hello world"');
      expect(result.clauses[0]?.[0]?.argv).toStrictEqual(['hello world']);
    });

    it('strips single quotes from string arguments', () => {
      const result = decompose("echo 'hello'");
      expect(result.clauses[0]?.[0]?.argv).toStrictEqual(['hello']);
    });

    it('marks variable expansion as dynamic', () => {
      const result = decompose('echo $VAR');
      expect(result.clauses[0]?.[0]?.argv).toStrictEqual(['<dynamic>']);
    });

    it('marks command substitution as dynamic', () => {
      const result = decompose('echo $(date)');
      expect(result.clauses[0]?.[0]?.argv).toStrictEqual(['<dynamic>']);
    });

    it('marks double-quoted string containing expansion as dynamic', () => {
      const result = decompose('echo "prefix-$VAR-suffix"');
      expect(result.clauses[0]?.[0]?.argv).toStrictEqual(['<dynamic>']);
    });

    it('preserves a static git commit message', () => {
      const result = decompose('git commit -m "fix: thing"');
      expect(result.ok).toBe(true);
      // argv starts after the command name 'git'; 'commit' is the first arg
      expect(result.clauses[0]?.[0]?.argv).toStrictEqual([
        'commit',
        '-m',
        'fix: thing',
      ]);
    });
  });

  describe('pipe positions', () => {
    it('labels a solo command as alone', () => {
      const result = decompose('ls');
      expect(result.clauses[0]?.[0]?.pipePosition).toBe('alone');
    });

    it('labels commands in a two-stage pipeline', () => {
      const result = decompose('ls | grep foo');
      expect(result.ok).toBe(true);
      expect(
        result.clauses.flat().map((cmd) => cmd.pipePosition),
      ).toStrictEqual(['first', 'downstream']);
    });

    it('labels commands in a three-stage pipeline', () => {
      const result = decompose('ls | grep foo | sort');
      expect(result.ok).toBe(true);
      expect(
        result.clauses.flat().map((cmd) => cmd.pipePosition),
      ).toStrictEqual(['first', 'downstream', 'downstream']);
    });

    it('labels both sides of && as alone', () => {
      const result = decompose('ls && pwd');
      expect(result.ok).toBe(true);
      expect(
        result.clauses.flat().map((cmd) => cmd.pipePosition),
      ).toStrictEqual(['alone', 'alone']);
    });

    it('labels both sides of ; as alone', () => {
      const result = decompose('ls; pwd');
      expect(result.ok).toBe(true);
      expect(
        result.clauses.flat().map((cmd) => cmd.pipePosition),
      ).toStrictEqual(['alone', 'alone']);
    });
  });

  describe('redirect classification', () => {
    it.each([
      ['ls > /tmp/out', 'out', '/tmp/out'],
      ['ls >> /tmp/out', 'append', '/tmp/out'],
      ['cmd 2> /dev/null', 'err', '/dev/null'],
      ['cmd 2>> /dev/null', 'err-append', '/dev/null'],
      ['cmd &> /tmp/out', 'out-err', '/tmp/out'],
      ['cmd &>> /tmp/out', 'out-err-append', '/tmp/out'],
      ['cmd < /tmp/in', 'in', '/tmp/in'],
    ])('%s produces redirect kind %s targeting %s', (source, kind, target) => {
      const result = decompose(source);
      expect(result.ok).toBe(true);
      expect(result.clauses[0]?.[0]?.redirects).toStrictEqual([
        { kind, target },
      ]);
    });

    it('classifies fd duplication (2>&1)', () => {
      const result = decompose('cmd 2>&1');
      expect(result.ok).toBe(true);
      expect(result.clauses[0]?.[0]?.redirects[0]?.kind).toBe('fd-dup');
    });

    it('classifies herestring (<<<)', () => {
      const result = decompose('cmd <<< "foo"');
      expect(result.ok).toBe(true);
      expect(result.clauses[0]?.[0]?.redirects[0]).toStrictEqual({
        kind: 'herestring',
        target: '<inline>',
      });
    });

    it('classifies heredoc (<<)', () => {
      const result = decompose('cat << EOF\nfoo\nEOF');
      expect(result.ok).toBe(true);
      expect(result.clauses[0]?.[0]?.redirects[0]).toStrictEqual({
        kind: 'heredoc',
        target: '<inline>',
      });
    });

    it('marks a variable-expanded redirect target as dynamic', () => {
      // $OUT inside double quotes is a string node; containsExpansion catches it
      const result = decompose('ls > "$OUT"');
      expect(result.ok).toBe(true);
      expect(result.clauses[0]?.[0]?.redirects[0]?.target).toBe('<dynamic>');
    });
  });

  describe('curl pipe shell detection', () => {
    it.each([
      ['curl', 'bash'],
      ['curl', 'sh'],
      ['curl', 'zsh'],
      ['curl', 'ksh'],
      ['curl', 'dash'],
      ['wget', 'bash'],
      ['wget', 'sh'],
      ['fetch', 'bash'],
    ])('detects %s | %s as curl_pipe_shell', (net, shell) => {
      expect(decompose(`${net} https://example.com | ${shell}`)).toHaveProperty(
        'reason',
        'curl_pipe_shell',
      );
    });

    it('does not flag a network cmd piped to a non-shell', () => {
      expect(decompose('curl https://example.com | grep foo').ok).toBe(true);
    });

    it('does not flag a non-network cmd piped to a shell', () => {
      expect(decompose('cat script.sh | bash').ok).toBe(true);
    });
  });

  describe('eval dynamic detection', () => {
    it('returns eval_dynamic for eval with a variable argument', () => {
      expect(decompose('eval $SOME_VAR')).toHaveProperty(
        'reason',
        'eval_dynamic',
      );
    });

    it('returns eval_dynamic for eval with a command substitution argument', () => {
      expect(decompose('eval "$(echo foo)"')).toHaveProperty(
        'reason',
        'eval_dynamic',
      );
    });

    it('does not flag eval with a static string argument', () => {
      expect(decompose('eval "ls -la"').ok).toBe(true);
    });

    it('does not flag eval with a static word argument', () => {
      expect(decompose('eval ls').ok).toBe(true);
    });
  });

  describe('multiple commands', () => {
    it('collects names from both sides of &&', () => {
      const result = decompose('ls && pwd');
      expect(result.ok).toBe(true);
      expect(result.clauses.flat().map((cmd) => cmd.name)).toStrictEqual([
        'ls',
        'pwd',
      ]);
    });

    it('collects names from both sides of ;', () => {
      const result = decompose('ls; pwd');
      expect(result.ok).toBe(true);
      expect(result.clauses.flat().map((cmd) => cmd.name)).toStrictEqual([
        'ls',
        'pwd',
      ]);
    });
  });

  describe('parse error', () => {
    it('returns parse_error for an unclosed quote', () => {
      expect(decompose("ls '")).toHaveProperty('reason', 'parse_error');
    });
  });

  describe('multi-clause decomposition', () => {
    it('splits && into two independent clauses', () => {
      const result = decompose('git status && git log');
      expect(result.ok).toBe(true);
      expect(result.clauses).toHaveLength(2);
      expect(result.clauses[0]?.[0]?.name).toBe('git');
      expect(result.clauses[1]?.[0]?.name).toBe('git');
    });

    it('splits || into two independent clauses', () => {
      const result = decompose('cat /etc/hosts || echo fallback');
      expect(result.ok).toBe(true);
      expect(result.clauses).toHaveLength(2);
    });

    it('splits mixed pipeline and && into clauses', () => {
      const result = decompose(
        'git log --oneline HEAD | tail -5 && git status',
      );
      expect(result.ok).toBe(true);
      expect(result.clauses).toHaveLength(2);
      expect(result.clauses[0]).toHaveLength(2); // pipeline: git log | tail
      expect(result.clauses[1]).toHaveLength(1); // standalone: git status
    });

    it('keeps a pipeline as a single clause', () => {
      const result = decompose('git log HEAD | tail -5');
      expect(result.ok).toBe(true);
      expect(result.clauses).toHaveLength(1);
      expect(result.clauses[0]).toHaveLength(2);
    });
  });
});
