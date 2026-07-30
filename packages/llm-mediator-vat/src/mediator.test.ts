import { describe, expect, it, vi } from 'vitest';

import { JSON_RPC_ERROR } from './json-rpc.ts';
import { makeMediator } from './mediator.ts';
import type { MediatorHooks } from './mediator.ts';

type FakeRemotable = { __fakeRemotable__: true; label: string };

const makeFake = (label: string): FakeRemotable => ({
  __fakeRemotable__: true,
  label,
});

const isFakeRemotable = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  (value as { __fakeRemotable__?: unknown }).__fakeRemotable__ === true;

/**
 * Build a mediator with configurable hooks. `redeem` and `invoke`
 * default to `vi.fn()` so tests can inspect calls.
 *
 * @param overrides - Any hooks to replace defaults with.
 * @returns The mediator plus references to the hook mocks.
 */
function buildMediator(overrides: Partial<MediatorHooks> = {}): {
  mediator: ReturnType<typeof makeMediator>;
  hooks: {
    redeem: ReturnType<typeof vi.fn>;
    invoke: ReturnType<typeof vi.fn>;
  };
} {
  const redeem = vi.fn(async (_url: string): Promise<unknown> => makeFake('x'));
  const invoke = vi.fn(
    async (_target: unknown, _method: string, _args: unknown[]) =>
      undefined as unknown,
  );
  const hooks: MediatorHooks = {
    redeem,
    invoke,
    isRemotable: isFakeRemotable,
    ...overrides,
  };
  return {
    mediator: makeMediator(hooks),
    hooks: { redeem, invoke },
  };
}

describe('dispatch: request validation', () => {
  it('rejects a non-object request', async () => {
    const { mediator } = buildMediator();
    const response = await mediator.dispatch(null);
    expect(response).toStrictEqual({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: JSON_RPC_ERROR.INVALID_REQUEST,
        message: 'not a well-formed JSON-RPC 2.0 request',
      },
    });
  });

  it('rejects a request without jsonrpc: "2.0"', async () => {
    const { mediator } = buildMediator();
    const response = await mediator.dispatch({
      id: 1,
      method: 'send',
      params: {},
    });
    expect(response).toMatchObject({
      error: { code: JSON_RPC_ERROR.INVALID_REQUEST },
    });
  });

  it('rejects an unknown method', async () => {
    const { mediator } = buildMediator();
    const response = await mediator.dispatch({
      jsonrpc: '2.0',
      id: 7,
      method: 'destroyEverything',
    });
    expect(response).toStrictEqual({
      jsonrpc: '2.0',
      id: 7,
      error: {
        code: JSON_RPC_ERROR.METHOD_NOT_FOUND,
        message: 'unknown method "destroyEverything"',
      },
    });
  });
});

describe('initialize', () => {
  it('redeems each URL in parallel and returns marker names in order', async () => {
    const alpha = makeFake('alpha');
    const beta = makeFake('beta');
    const redeem = vi.fn(async (url: string) => {
      if (url === 'ocap:alpha') {
        return alpha;
      }
      if (url === 'ocap:beta') {
        return beta;
      }
      throw new Error(`unknown url ${url}`);
    });
    const { mediator } = buildMediator({ redeem });
    const response = await mediator.dispatch({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { urls: ['ocap:alpha', 'ocap:beta'] },
    });
    expect(response).toStrictEqual({
      jsonrpc: '2.0',
      id: 1,
      result: { refs: ['@@o1', '@@o2'] },
    });
    expect(redeem).toHaveBeenCalledTimes(2);
  });

  it('rejects a second initialize call', async () => {
    const { mediator } = buildMediator();
    const first = await mediator.dispatch({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { urls: [] },
    });
    expect(first).toHaveProperty('result');
    const second = await mediator.dispatch({
      jsonrpc: '2.0',
      id: 2,
      method: 'initialize',
      params: { urls: [] },
    });
    expect(second).toMatchObject({
      id: 2,
      error: {
        code: JSON_RPC_ERROR.APPLICATION_ERROR,
        message: 'initialize may only be called once per session',
      },
    });
  });

  it('rejects non-string entries in params.urls', async () => {
    const { mediator } = buildMediator();
    const response = await mediator.dispatch({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { urls: ['ocap:x', 42] },
    });
    expect(response).toMatchObject({
      error: { code: JSON_RPC_ERROR.INVALID_PARAMS },
    });
  });
});

describe('send', () => {
  it('rejects a send before initialize', async () => {
    const { mediator } = buildMediator();
    const response = await mediator.dispatch({
      jsonrpc: '2.0',
      id: 1,
      method: 'send',
      params: { target: '@@o1', method: 'ping', args: [] },
    });
    expect(response).toMatchObject({
      error: {
        code: JSON_RPC_ERROR.APPLICATION_ERROR,
        message: 'send called before initialize',
      },
    });
  });

  it('rejects an unknown @@ target', async () => {
    const alpha = makeFake('alpha');
    const { mediator } = buildMediator({ redeem: vi.fn(async () => alpha) });
    await mediator.dispatch({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { urls: ['ocap:alpha'] },
    });
    const response = await mediator.dispatch({
      jsonrpc: '2.0',
      id: 2,
      method: 'send',
      params: { target: '@@o99', method: 'noSuch', args: [] },
    });
    expect(response).toMatchObject({
      error: { code: JSON_RPC_ERROR.INVALID_PARAMS },
    });
  });

  it('expands marker args to live references before invoking', async () => {
    const alpha = makeFake('alpha');
    const beta = makeFake('beta');
    const invoke = vi.fn(
      async (_target: unknown, _method: string, _args: unknown[]) => 42,
    );
    const { mediator } = buildMediator({
      redeem: async (url) => (url === 'ocap:alpha' ? alpha : beta),
      invoke,
    });
    await mediator.dispatch({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { urls: ['ocap:alpha', 'ocap:beta'] },
    });
    await mediator.dispatch({
      jsonrpc: '2.0',
      id: 2,
      method: 'send',
      params: {
        target: '@@o1',
        method: 'handoff',
        args: ['@@o2', { via: '@@o2', tag: 'plain' }],
      },
    });
    expect(invoke).toHaveBeenCalledWith(alpha, 'handoff', [
      beta,
      { via: beta, tag: 'plain' },
    ]);
  });

  it('substitutes remotables in the result with marker strings', async () => {
    const alpha = makeFake('alpha');
    const beta = makeFake('beta');
    // Give `alpha.receive()` a return value that mixes in a new remotable.
    const { mediator } = buildMediator({
      redeem: async () => alpha,
      invoke: async () => ({ echo: 'ok', partner: beta }),
    });
    await mediator.dispatch({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { urls: ['ocap:alpha'] },
    });
    const response = await mediator.dispatch({
      jsonrpc: '2.0',
      id: 2,
      method: 'send',
      params: { target: '@@o1', method: 'introducePartner', args: [] },
    });
    expect(response).toStrictEqual({
      jsonrpc: '2.0',
      id: 2,
      result: { echo: 'ok', partner: '@@o2' },
    });
  });

  it('reuses names for objects seen previously', async () => {
    const alpha = makeFake('alpha');
    const beta = makeFake('beta');
    const { mediator } = buildMediator({
      redeem: async () => alpha,
      invoke: async () => beta,
    });
    await mediator.dispatch({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { urls: ['ocap:alpha'] },
    });
    // First send returns beta — beta gets @@o2.
    const first = (await mediator.dispatch({
      jsonrpc: '2.0',
      id: 2,
      method: 'send',
      params: { target: '@@o1', method: 'getBeta', args: [] },
    })) as { result?: unknown };
    expect(first.result).toBe('@@o2');
    // Second send returns beta again — same name reused.
    const second = (await mediator.dispatch({
      jsonrpc: '2.0',
      id: 3,
      method: 'send',
      params: { target: '@@o1', method: 'getBeta', args: [] },
    })) as { result?: unknown };
    expect(second.result).toBe('@@o2');
  });

  it('packages an invoke() rejection as an application error', async () => {
    const alpha = makeFake('alpha');
    const { mediator } = buildMediator({
      redeem: async () => alpha,
      invoke: async () => {
        throw new Error('remote said no');
      },
    });
    await mediator.dispatch({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { urls: ['ocap:alpha'] },
    });
    const response = await mediator.dispatch({
      jsonrpc: '2.0',
      id: 2,
      method: 'send',
      params: { target: '@@o1', method: 'boom', args: [] },
    });
    expect(response).toStrictEqual({
      jsonrpc: '2.0',
      id: 2,
      error: {
        code: JSON_RPC_ERROR.APPLICATION_ERROR,
        message: 'remote said no',
      },
    });
  });
});

describe('resetSession', () => {
  it('reverts to the pre-initialize state', async () => {
    const alpha = makeFake('alpha');
    const { mediator } = buildMediator({ redeem: async () => alpha });
    await mediator.dispatch({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { urls: ['ocap:alpha'] },
    });
    mediator.resetSession();
    // Send now fails as pre-initialize.
    const response = await mediator.dispatch({
      jsonrpc: '2.0',
      id: 2,
      method: 'send',
      params: { target: '@@o1', method: 'ping', args: [] },
    });
    expect(response).toMatchObject({
      error: {
        code: JSON_RPC_ERROR.APPLICATION_ERROR,
        message: 'send called before initialize',
      },
    });
  });

  it('resets the name counter so o1 is reallocated fresh', async () => {
    const alpha = makeFake('alpha');
    const gamma = makeFake('gamma');
    const { mediator } = buildMediator({
      redeem: async (url) => (url === 'ocap:alpha' ? alpha : gamma),
    });
    const first = (await mediator.dispatch({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { urls: ['ocap:alpha'] },
    })) as { result?: { refs?: unknown } };
    expect(first.result?.refs).toStrictEqual(['@@o1']);
    mediator.resetSession();
    const second = (await mediator.dispatch({
      jsonrpc: '2.0',
      id: 2,
      method: 'initialize',
      params: { urls: ['ocap:gamma'] },
    })) as { result?: { refs?: unknown } };
    expect(second.result?.refs).toStrictEqual(['@@o1']);
  });
});
