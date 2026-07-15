import { describe, expect, it } from 'vitest';

import { causeChainMessage } from './utils.ts';

describe('causeChainMessage', () => {
  it('returns the message of a plain error', () => {
    expect(causeChainMessage(new Error('boom'))).toBe('boom');
  });

  it('walks a chain of Error causes', () => {
    const root = new Error('root reason');
    const wrapped = new Error('wrapper', { cause: root });
    expect(causeChainMessage(wrapped)).toContain('root reason');
    expect(causeChainMessage(wrapped)).toContain('wrapper');
  });

  it('reads a non-Error JSON-RPC error object on cause', () => {
    // A failure at the initVat RPC boundary surfaces as a plain object, not an
    // Error instance — the reason must still be found.
    const wrapped = new Error('Failed to launch vat v1 (main)', {
      cause: {
        code: -32000,
        message: 'Vat "v1" requested unknown global "URL"',
      },
    });
    expect(causeChainMessage(wrapped)).toContain('unknown global "URL"');
  });

  it('includes a cause `data` payload', () => {
    const wrapped = new Error('Failed to launch vat v1 (main)', {
      cause: {
        code: -32602,
        message: 'Invalid params',
        data: { name: 'nope' },
      },
    });
    const flattened = causeChainMessage(wrapped);
    expect(flattened).toContain('Invalid params');
    expect(flattened).toContain('nope');
  });

  it('terminates on a cyclic cause chain', () => {
    const a = new Error('a') as Error & { cause?: unknown };
    const b = new Error('b') as Error & { cause?: unknown };
    a.cause = b;
    b.cause = a;
    expect(causeChainMessage(a)).toBe('a\nb');
  });
});
