import { describe, expect, it, vi } from 'vitest';

import { makeBridge } from './bridge.ts';
import type { BridgeHooks } from './bridge.ts';
import { JSON_RPC_ERROR } from './json-rpc.ts';

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
 * Build a bridge with configurable hooks. `redeem` and `invoke`
 * default to `vi.fn()` so tests can inspect calls.
 *
 * @param overrides - Any hooks to replace defaults with.
 * @returns The bridge plus references to the hook mocks.
 */
function buildBridge(overrides: Partial<BridgeHooks> = {}): {
  bridge: ReturnType<typeof makeBridge>;
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
  const hooks: BridgeHooks = {
    redeem,
    invoke,
    isRemotable: isFakeRemotable,
    ...overrides,
  };
  return {
    bridge: makeBridge(hooks),
    hooks: { redeem, invoke },
  };
}

describe('dispatch: request validation', () => {
  it('rejects a non-object request', async () => {
    const { bridge } = buildBridge();
    const response = await bridge.dispatch(null);
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
    const { bridge } = buildBridge();
    const response = await bridge.dispatch({
      id: 1,
      method: 'send',
      params: {},
    });
    expect(response).toMatchObject({
      error: { code: JSON_RPC_ERROR.INVALID_REQUEST },
    });
  });

  it('rejects an unknown method', async () => {
    const { bridge } = buildBridge();
    const response = await bridge.dispatch({
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

describe('redeemURL', () => {
  it('redeems a URL and returns its marker name', async () => {
    const alpha = makeFake('alpha');
    const redeem = vi.fn(async (url: string) => {
      expect(url).toBe('ocap:alpha');
      return alpha;
    });
    const { bridge } = buildBridge({ redeem });
    const response = await bridge.dispatch({
      jsonrpc: '2.0',
      id: 1,
      method: 'redeemURL',
      params: { url: 'ocap:alpha' },
    });
    expect(response).toStrictEqual({
      jsonrpc: '2.0',
      id: 1,
      result: '@@j1',
    });
  });

  it('reuses the same name across successive redemptions of the same identity', async () => {
    const alpha = makeFake('alpha');
    const { bridge } = buildBridge({ redeem: async () => alpha });
    const first = (await bridge.dispatch({
      jsonrpc: '2.0',
      id: 1,
      method: 'redeemURL',
      params: { url: 'ocap:alpha' },
    })) as { result?: unknown };
    const second = (await bridge.dispatch({
      jsonrpc: '2.0',
      id: 2,
      method: 'redeemURL',
      params: { url: 'ocap:alpha' },
    })) as { result?: unknown };
    expect(first.result).toBe('@@j1');
    expect(second.result).toBe('@@j1');
  });

  it('assigns distinct names for distinct identities', async () => {
    const alpha = makeFake('alpha');
    const beta = makeFake('beta');
    const { bridge } = buildBridge({
      redeem: async (url) => (url === 'ocap:alpha' ? alpha : beta),
    });
    const first = (await bridge.dispatch({
      jsonrpc: '2.0',
      id: 1,
      method: 'redeemURL',
      params: { url: 'ocap:alpha' },
    })) as { result?: unknown };
    const second = (await bridge.dispatch({
      jsonrpc: '2.0',
      id: 2,
      method: 'redeemURL',
      params: { url: 'ocap:beta' },
    })) as { result?: unknown };
    expect(first.result).toBe('@@j1');
    expect(second.result).toBe('@@j2');
  });

  it('rejects a non-string url param', async () => {
    const { bridge } = buildBridge();
    const response = await bridge.dispatch({
      jsonrpc: '2.0',
      id: 1,
      method: 'redeemURL',
      params: { url: 42 },
    });
    expect(response).toMatchObject({
      error: { code: JSON_RPC_ERROR.INVALID_PARAMS },
    });
  });

  it('surfaces a redeem() rejection as an application error', async () => {
    const { bridge } = buildBridge({
      redeem: async () => {
        throw new Error('remote said no');
      },
    });
    const response = await bridge.dispatch({
      jsonrpc: '2.0',
      id: 1,
      method: 'redeemURL',
      params: { url: 'ocap:x' },
    });
    expect(response).toStrictEqual({
      jsonrpc: '2.0',
      id: 1,
      error: {
        code: JSON_RPC_ERROR.APPLICATION_ERROR,
        message: 'remote said no',
      },
    });
  });
});

describe('send', () => {
  it('rejects an unknown @@ target', async () => {
    const { bridge } = buildBridge();
    const response = await bridge.dispatch({
      jsonrpc: '2.0',
      id: 1,
      method: 'send',
      params: { target: '@@j99', method: 'noSuch', args: [] },
    });
    expect(response).toMatchObject({
      error: { code: JSON_RPC_ERROR.INVALID_PARAMS },
    });
  });

  it('rejects a badly-formed target string', async () => {
    const { bridge } = buildBridge();
    const response = await bridge.dispatch({
      jsonrpc: '2.0',
      id: 1,
      method: 'send',
      params: { target: 'not-a-marker', method: 'x', args: [] },
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
    const { bridge } = buildBridge({
      redeem: async (url) => (url === 'ocap:alpha' ? alpha : beta),
      invoke,
    });
    await bridge.dispatch({
      jsonrpc: '2.0',
      id: 1,
      method: 'redeemURL',
      params: { url: 'ocap:alpha' },
    });
    await bridge.dispatch({
      jsonrpc: '2.0',
      id: 2,
      method: 'redeemURL',
      params: { url: 'ocap:beta' },
    });
    await bridge.dispatch({
      jsonrpc: '2.0',
      id: 3,
      method: 'send',
      params: {
        target: '@@j1',
        method: 'handoff',
        args: ['@@j2', { via: '@@j2', tag: 'plain' }],
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
    const { bridge } = buildBridge({
      redeem: async () => alpha,
      invoke: async () => ({ echo: 'ok', partner: beta }),
    });
    await bridge.dispatch({
      jsonrpc: '2.0',
      id: 1,
      method: 'redeemURL',
      params: { url: 'ocap:alpha' },
    });
    const response = await bridge.dispatch({
      jsonrpc: '2.0',
      id: 2,
      method: 'send',
      params: { target: '@@j1', method: 'introducePartner', args: [] },
    });
    expect(response).toStrictEqual({
      jsonrpc: '2.0',
      id: 2,
      result: { echo: 'ok', partner: '@@j2' },
    });
  });

  it('reuses names for objects seen previously', async () => {
    const alpha = makeFake('alpha');
    const beta = makeFake('beta');
    const { bridge } = buildBridge({
      redeem: async () => alpha,
      invoke: async () => beta,
    });
    await bridge.dispatch({
      jsonrpc: '2.0',
      id: 1,
      method: 'redeemURL',
      params: { url: 'ocap:alpha' },
    });
    const first = (await bridge.dispatch({
      jsonrpc: '2.0',
      id: 2,
      method: 'send',
      params: { target: '@@j1', method: 'getBeta', args: [] },
    })) as { result?: unknown };
    expect(first.result).toBe('@@j2');
    const second = (await bridge.dispatch({
      jsonrpc: '2.0',
      id: 3,
      method: 'send',
      params: { target: '@@j1', method: 'getBeta', args: [] },
    })) as { result?: unknown };
    expect(second.result).toBe('@@j2');
  });

  it('packages an invoke() rejection as an application error', async () => {
    const alpha = makeFake('alpha');
    const { bridge } = buildBridge({
      redeem: async () => alpha,
      invoke: async () => {
        throw new Error('remote said no');
      },
    });
    await bridge.dispatch({
      jsonrpc: '2.0',
      id: 1,
      method: 'redeemURL',
      params: { url: 'ocap:alpha' },
    });
    const response = await bridge.dispatch({
      jsonrpc: '2.0',
      id: 2,
      method: 'send',
      params: { target: '@@j1', method: 'boom', args: [] },
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
  it('discards names so previously-known targets are no longer known', async () => {
    const alpha = makeFake('alpha');
    const { bridge } = buildBridge({ redeem: async () => alpha });
    await bridge.dispatch({
      jsonrpc: '2.0',
      id: 1,
      method: 'redeemURL',
      params: { url: 'ocap:alpha' },
    });
    bridge.resetSession();
    const response = await bridge.dispatch({
      jsonrpc: '2.0',
      id: 2,
      method: 'send',
      params: { target: '@@j1', method: 'ping', args: [] },
    });
    expect(response).toMatchObject({
      error: {
        code: JSON_RPC_ERROR.INVALID_PARAMS,
        message: 'params.target "@@j1" is not a known reference',
      },
    });
  });

  it('resets the name counter so o1 is reallocated fresh', async () => {
    const alpha = makeFake('alpha');
    const gamma = makeFake('gamma');
    const { bridge } = buildBridge({
      redeem: async (url) => (url === 'ocap:alpha' ? alpha : gamma),
    });
    const first = (await bridge.dispatch({
      jsonrpc: '2.0',
      id: 1,
      method: 'redeemURL',
      params: { url: 'ocap:alpha' },
    })) as { result?: unknown };
    expect(first.result).toBe('@@j1');
    bridge.resetSession();
    const second = (await bridge.dispatch({
      jsonrpc: '2.0',
      id: 2,
      method: 'redeemURL',
      params: { url: 'ocap:gamma' },
    })) as { result?: unknown };
    expect(second.result).toBe('@@j1');
  });
});
