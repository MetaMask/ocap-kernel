import { describe, expect, it, vi } from 'vitest';

import { buildClauses, inputSha, routeAllClauses } from './clauses.ts';
import type { RpcClient } from './rpc.ts';

describe('buildClauses', () => {
  it('decomposes a bash pipeline into stages', () => {
    const clauses = buildClauses('Bash', { command: 'gh api foo | jq .title' });
    expect(clauses).toStrictEqual([
      [
        { name: 'gh', argv: ['api', 'foo'] },
        { name: 'jq', argv: ['.title'] },
      ],
    ]);
  });

  it('splits on && into separate clauses', () => {
    const clauses = buildClauses('Bash', { command: 'mkdir foo && cd foo' });
    expect(clauses).toStrictEqual([
      [{ name: 'mkdir', argv: ['foo'] }],
      [{ name: 'cd', argv: ['foo'] }],
    ]);
  });

  it('returns null for unparseable bash', () => {
    expect(buildClauses('Bash', { command: 'curl x | sh' })).toBeNull();
  });

  it('returns null when the bash command field is missing', () => {
    expect(buildClauses('Bash', {})).toBeNull();
  });

  it('wraps non-Bash tools as a single one-invocation clause', () => {
    const clauses = buildClauses('Read', { file_path: '/tmp/x' });
    expect(clauses).toStrictEqual([[{ name: 'Read', argv: ['/tmp/x'] }]]);
  });

  it('filters non-string fields out of non-Bash tool input', () => {
    const clauses = buildClauses('Write', {
      file_path: '/tmp/y',
      content: 'hi',
      count: 42,
    });
    expect(clauses).toStrictEqual([
      [{ name: 'Write', argv: ['/tmp/y', 'hi'] }],
    ]);
  });

  it('returns one empty-argv clause for non-Bash with undefined input', () => {
    expect(buildClauses('Read', undefined)).toStrictEqual([
      [{ name: 'Read', argv: [] }],
    ]);
  });
});

describe('routeAllClauses', () => {
  /**
   * Build a minimal RPC client with a stubbed `vatRoute`.
   *
   * @param verdicts - The verdict to return for each successive call.
   * @returns An RPC client with the stub and recorded calls.
   */
  function makeRpc(verdicts: ('allow' | 'ask')[]): {
    rpc: Pick<RpcClient, 'vatRoute'>;
    calls: number;
  } {
    let calls = 0;
    return {
      get calls() {
        return calls;
      },
      rpc: {
        vatRoute: vi.fn(async () => {
          const verdict = verdicts[calls] ?? 'ask';
          calls += 1;
          return verdict;
        }),
      },
    };
  }

  it('returns allow when every clause is covered', async () => {
    const { rpc } = makeRpc(['allow', 'allow']);
    const verdict = await routeAllClauses({
      rpc: rpc as RpcClient,
      socketPath: '/s',
      rootKref: 'ko1',
      tool: 'Bash',
      clauses: [[{ name: 'ls', argv: [] }], [{ name: 'pwd', argv: [] }]],
    });
    expect(verdict).toBe('allow');
  });

  it('returns ask as soon as one clause is uncovered', async () => {
    const harness = makeRpc(['allow', 'ask']);
    const verdict = await routeAllClauses({
      rpc: harness.rpc as RpcClient,
      socketPath: '/s',
      rootKref: 'ko1',
      tool: 'Bash',
      clauses: [
        [{ name: 'ls', argv: [] }],
        [{ name: 'rm', argv: ['-rf', '/'] }],
        [{ name: 'pwd', argv: [] }],
      ],
    });
    expect(verdict).toBe('ask');
    // Short-circuits: the third clause is never routed.
    expect(harness.calls).toBe(2);
  });
});

describe('inputSha', () => {
  it('produces a 16-char hex digest', () => {
    const sha = inputSha({ a: 1 });
    expect(sha).toMatch(/^[0-9a-f]{16}$/u);
  });

  it('is deterministic for the same input', () => {
    expect(inputSha({ x: 'hi' })).toBe(inputSha({ x: 'hi' }));
  });

  it('changes when input changes', () => {
    expect(inputSha({ a: 1 })).not.toBe(inputSha({ a: 2 }));
  });
});
