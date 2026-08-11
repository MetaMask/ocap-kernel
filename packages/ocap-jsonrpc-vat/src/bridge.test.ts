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

  it('rejects a request with no id rather than treating it as a notification', async () => {
    const { bridge } = buildBridge();
    const response = await bridge.dispatch({
      jsonrpc: '2.0',
      method: 'redeemURL',
      params: { url: 'ocap:alpha' },
    });

    // Every line in gets exactly one line back. Serving notifications
    // would make some lines answerable and others not, which desynchronizes
    // a persistent line-delimited stream for good.
    expect(response).toStrictEqual({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: JSON_RPC_ERROR.INVALID_REQUEST,
        message: 'not a well-formed JSON-RPC 2.0 request',
      },
    });
  });

  it('accepts an explicit null id', async () => {
    const { bridge } = buildBridge({ redeem: async () => makeFake('alpha') });
    const response = await bridge.dispatch({
      jsonrpc: '2.0',
      id: null,
      method: 'redeemURL',
      params: { url: 'ocap:alpha' },
    });

    // A null id is legal in a request; only an absent one is a notification.
    expect(response).toStrictEqual({
      jsonrpc: '2.0',
      id: null,
      result: '@@j1',
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

  it('reports a void result as null so the response survives encoding', async () => {
    const alpha = makeFake('alpha');
    const { bridge } = buildBridge({
      redeem: async () => alpha,
      invoke: async () => undefined,
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
      params: { target: '@@j1', method: 'doNothing', args: [] },
    });

    // `undefined` would be dropped by JSON.stringify, leaving a response
    // with neither `result` nor `error` — valid as neither outcome.
    expect(response).toStrictEqual({ jsonrpc: '2.0', id: 2, result: null });
    expect(JSON.parse(JSON.stringify(response))).toHaveProperty('result', null);
  });

  it.each([
    ['false', false],
    ['zero', 0],
    ['empty string', ''],
  ])(
    'preserves a falsy %s result rather than nulling it',
    async (_l, value) => {
      const alpha = makeFake('alpha');
      const { bridge } = buildBridge({
        redeem: async () => alpha,
        invoke: async () => value,
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
        params: { target: '@@j1', method: 'give', args: [] },
      });

      expect(response).toStrictEqual({ jsonrpc: '2.0', id: 2, result: value });
    },
  );
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
        message:
          'params.target "@@j1" is not a known reference on this ' +
          'connection (known here: none)',
      },
    });
  });

  it('names the connection and its known refs when a lookup misses', async () => {
    const alpha = makeFake('alpha');
    const { bridge } = buildBridge({
      redeem: async () => alpha,
      label: 'connection 7',
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
      params: { target: '@@j9', method: 'ping', args: [] },
    });
    // The usual cause is a name minted on a different connection, so the
    // message has to say which connection is complaining and what it holds.
    expect(response).toMatchObject({
      error: {
        code: JSON_RPC_ERROR.INVALID_PARAMS,
        message:
          'params.target "@@j9" is not a known reference on ' +
          'connection 7 (known here: @@j1)',
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

describe('dispatch: name disclosure is atomic', () => {
  const redeemFake = async (): Promise<unknown> => makeFake('root');

  /**
   * Redeem a URL so the connection has a usable target, returning its name.
   *
   * @param bridge - The bridge to prime.
   * @returns The marker string naming the redeemed object.
   */
  async function primeTarget(
    bridge: ReturnType<typeof makeBridge>,
  ): Promise<string> {
    const response = (await bridge.dispatch({
      jsonrpc: '2.0',
      id: 'prime',
      method: 'redeemURL',
      params: { url: 'ocap://root' },
    })) as { result: string };
    return response.result;
  }

  it.each([
    [
      'a non-finite number',
      (): unknown => ({ ref: makeFake('leaked'), bad: Number.NaN }),
    ],
    [
      'an unsettled promise',
      (): unknown => ({
        ref: makeFake('leaked'),
        bad: new Promise(() => undefined),
      }),
    ],
    ['a bigint', (): unknown => ({ ref: makeFake('leaked'), bad: 1n })],
  ])(
    'discards names minted for a reply rejected over %s',
    async (_label, makeResult) => {
      const { bridge } = buildBridge({
        redeem: redeemFake,
        invoke: async (): Promise<unknown> => makeResult(),
      });
      const target = await primeTarget(bridge);

      const failed = (await bridge.dispatch({
        jsonrpc: '2.0',
        id: 1,
        method: 'send',
        params: { target, method: 'getRef', args: [] },
      })) as { error?: { code: number } };
      expect(failed.error).toBeDefined();

      // The walk minted a name for `ref` before hitting the bad value. Names
      // are sequential, so guessing it takes no work — it must not resolve.
      const probe = (await bridge.dispatch({
        jsonrpc: '2.0',
        id: 2,
        method: 'send',
        params: { target: '@@j2', method: 'anything', args: [] },
      })) as { error?: { code: number; message: string } };
      expect(probe.error?.code).toBe(JSON_RPC_ERROR.INVALID_PARAMS);
      expect(probe.error?.message).toMatch(/not a known reference/u);
    },
  );

  it('keeps a name already disclosed by an earlier successful reply', async () => {
    const shared = makeFake('shared');
    let failNext = false;
    const { bridge } = buildBridge({
      redeem: redeemFake,
      invoke: async (): Promise<unknown> =>
        failNext ? { ref: shared, bad: Number.NaN } : shared,
    });
    const target = await primeTarget(bridge);

    const first = (await bridge.dispatch({
      jsonrpc: '2.0',
      id: 1,
      method: 'send',
      params: { target, method: 'getShared', args: [] },
    })) as { result: string };
    const disclosed = first.result;

    // A later failed request mentions the same object. Rolling that request
    // back must not revoke a name the client was legitimately given.
    failNext = true;
    const failed = (await bridge.dispatch({
      jsonrpc: '2.0',
      id: 2,
      method: 'send',
      params: { target, method: 'getShared', args: [] },
    })) as { error?: unknown };
    expect(failed.error).toBeDefined();

    failNext = false;
    const after = (await bridge.dispatch({
      jsonrpc: '2.0',
      id: 3,
      method: 'send',
      params: { target: disclosed, method: 'stillThere', args: [] },
    })) as { result?: unknown; error?: unknown };
    expect(after.error).toBeUndefined();
  });

  it('reuses the id a rolled-back name held, leaving no gap', async () => {
    let failNext = true;
    const { bridge } = buildBridge({
      redeem: redeemFake,
      invoke: async (): Promise<unknown> =>
        failNext
          ? { ref: makeFake('discarded'), bad: Number.NaN }
          : makeFake('kept'),
    });
    const target = await primeTarget(bridge);

    await bridge.dispatch({
      jsonrpc: '2.0',
      id: 1,
      method: 'send',
      params: { target, method: 'fails', args: [] },
    });
    failNext = false;
    const ok = (await bridge.dispatch({
      jsonrpc: '2.0',
      id: 2,
      method: 'send',
      params: { target, method: 'works', args: [] },
    })) as { result: string };

    // The discarded name was never disclosed, so its id is free to reuse.
    expect(ok.result).toBe('@@j2');
  });

  it('still registers names for a reply that succeeds', async () => {
    const { bridge } = buildBridge({
      redeem: redeemFake,
      invoke: async (): Promise<unknown> => makeFake('handed over'),
    });
    const target = await primeTarget(bridge);

    const response = (await bridge.dispatch({
      jsonrpc: '2.0',
      id: 1,
      method: 'send',
      params: { target, method: 'getRef', args: [] },
    })) as { result: string };
    expect(response.result).toBe('@@j2');

    const reuse = (await bridge.dispatch({
      jsonrpc: '2.0',
      id: 2,
      method: 'send',
      params: { target: response.result, method: 'usable', args: [] },
    })) as { error?: unknown };
    expect(reuse.error).toBeUndefined();
  });
});
