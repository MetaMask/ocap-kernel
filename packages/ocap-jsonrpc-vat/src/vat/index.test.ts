import type { Baggage } from '@metamask/ocap-kernel';
import { describe, expect, it, vi } from 'vitest';

import {
  makeMockBaggage,
  makeMockConnection,
  makeMockListener,
  requestLine,
} from '../../test/helpers.ts';
import { JSON_RPC_ERROR } from '../json-rpc.ts';

// The exo wrapper is irrelevant here and would need lockdown; the method bag
// is what these tests drive. Same approach as the other vat tests in the repo.
vi.mock('@metamask/kernel-utils/exo', () => ({
  makeDefaultExo: (_name: string, methods: Record<string, unknown>) => methods,
}));

// `E()` is not functional under `mock-endoify` — `HandledPromise` is absent,
// so any `E(x).m()` throws. Every target the vat reaches here is a local
// plain object, so identity is the faithful substitute, and what these tests
// cover is the shape of the accept/serve loops rather than eventual-send
// semantics. `bridge.ts` takes `redeem`/`invoke` as hooks for the same
// reason: it is meant to be exercised without a live kernel.
vi.mock('@endo/eventual-send', () => ({
  E: (target: unknown) => target,
}));

const { buildRootObject } = await import('./index.ts');

type VatRoot = {
  bootstrap: (vats: unknown, services: unknown) => Promise<unknown>;
};

/**
 * A stand-in for a reference a URL redeems to. Distinct per URL so a test
 * can tell whose reference it is holding.
 *
 * @param label - Identifies which redemption produced this reference.
 * @returns A callable stand-in reference.
 */
function makeRedeemed(label: string): { whoami: () => string } {
  return { whoami: () => label };
}

/**
 * Start the vat against a set of connections.
 *
 * @param connections - Connections for the listener to hand out.
 * @returns The listener handle, so tests can count `accept()` calls.
 */
async function startVat(
  connections: ReturnType<typeof makeMockConnection>[],
): Promise<ReturnType<typeof makeMockListener>> {
  const listener = makeMockListener(connections);
  const root = buildRootObject(
    undefined,
    undefined,
    makeMockBaggage() as unknown as Baggage,
  ) as VatRoot;
  await root.bootstrap(
    {},
    {
      ocapURLRedemptionService: {
        redeem: async (url: string) => makeRedeemed(url),
      },
      socket: listener.socket,
    },
  );
  return listener;
}

describe('accept loop: per-connection name tables', () => {
  it('does not resolve a name minted on another connection', async () => {
    const first = makeMockConnection([
      requestLine(1, 'redeemURL', { url: 'ocap://alpha' }),
    ]);
    // Forges the name the other connection was just given.
    const second = makeMockConnection([
      requestLine(1, 'send', { target: '@@j1', method: 'whoami', args: [] }),
    ]);
    await startVat([first, second]);

    await vi.waitFor(() => {
      expect(first.written).toHaveLength(1);
      expect(second.written).toHaveLength(1);
    });

    expect(first.replies()[0]?.result).toBe('@@j1');
    const failure = second.replies()[0]?.error as {
      code: number;
      message: string;
    };
    expect(failure.code).toBe(JSON_RPC_ERROR.INVALID_PARAMS);
    expect(failure.message).toMatch(/not a known reference/u);
    // The label makes it obvious which connection failed to resolve it.
    expect(failure.message).toMatch(/connection 2/u);
  });

  it('mints the same name for different references on each connection', async () => {
    const first = makeMockConnection([
      requestLine(1, 'redeemURL', { url: 'ocap://alpha' }),
      requestLine(2, 'send', { target: '@@j1', method: 'whoami', args: [] }),
    ]);
    const second = makeMockConnection([
      requestLine(1, 'redeemURL', { url: 'ocap://beta' }),
      requestLine(2, 'send', { target: '@@j1', method: 'whoami', args: [] }),
    ]);
    await startVat([first, second]);

    await vi.waitFor(() => {
      expect(first.written).toHaveLength(2);
      expect(second.written).toHaveLength(2);
    });

    // Both connections independently mint `@@j1` — the counters are their
    // own — and each name resolves to that connection's own reference.
    expect(first.replies()[0]?.result).toBe('@@j1');
    expect(second.replies()[0]?.result).toBe('@@j1');
    expect(first.replies()[1]?.result).toBe('ocap://alpha');
    expect(second.replies()[1]?.result).toBe('ocap://beta');
  });
});

describe('accept loop: liveness', () => {
  it('keeps serving new peers while an earlier one is stalled', async () => {
    // Never sends anything and never hangs up.
    const stalled = makeMockConnection([], { stall: true });
    const healthy = makeMockConnection([
      requestLine(1, 'redeemURL', { url: 'ocap://later' }),
    ]);
    const listener = await startVat([stalled, healthy]);

    await vi.waitFor(() => {
      expect(healthy.written).toHaveLength(1);
    });
    expect(healthy.replies()[0]?.result).toBe('@@j1');
    // Third accept() is the one that drains the queue and ends the loop,
    // which can only happen if serving never blocked accepting.
    await vi.waitFor(() => {
      expect(listener.acceptCount()).toBe(3);
    });
    expect(stalled.written).toHaveLength(0);
  });

  it('closes a connection once its peer goes away', async () => {
    const connection = makeMockConnection([
      requestLine(1, 'redeemURL', { url: 'ocap://transient' }),
    ]);
    await startVat([connection]);

    await vi.waitFor(() => {
      expect(connection.isClosed()).toBe(true);
    });
  });
});
