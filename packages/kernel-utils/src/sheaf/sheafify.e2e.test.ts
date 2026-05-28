import { M } from '@endo/patterns';
import { describe, expect, it, vi } from 'vitest';

import { callable, constant } from './metadata.ts';
import { makeSection } from './section.ts';
import { sheafify } from './sheafify.ts';
import type { Lift, PresheafSection } from './types.ts';

// Thin cast for calling exo methods directly in tests without going through
// HandledPromise (which is not available in the test environment).
// eslint-disable-next-line id-length
const E = (obj: unknown) =>
  obj as Record<string, (...args: unknown[]) => Promise<unknown>>;

// ---------------------------------------------------------------------------
// E2E: cost-optimal routing
// ---------------------------------------------------------------------------

describe('e2e: cost-optimal routing', () => {
  it('argmin picks cheapest section, re-sheafification expands landscape', async () => {
    const argmin: Lift<{ cost: number }> = async function* (germs) {
      yield* [...germs].sort(
        (a, b) =>
          (a.metadata?.cost ?? Infinity) - (b.metadata?.cost ?? Infinity),
      );
    };

    const remote0GetBalance = vi.fn((_acct: string): number => 0);
    const local1GetBalance = vi.fn((_acct: string): number => 0);

    const sections: PresheafSection<{ cost: number }>[] = [
      {
        // Remote: covers all accounts, expensive
        exo: makeSection(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: remote0GetBalance },
        ),
        metadata: constant({ cost: 100 }),
      },
      {
        // Local cache: covers only 'alice', cheap
        exo: makeSection(
          'Wallet:1',
          M.interface('Wallet:1', {
            getBalance: M.call(M.eq('alice')).returns(M.number()),
          }),
          { getBalance: local1GetBalance },
        ),
        metadata: constant({ cost: 1 }),
      },
    ];

    let wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      lift: argmin,
    });

    // alice: both sections match, argmin picks local (cost=1)
    await E(wallet).getBalance('alice');
    expect(local1GetBalance).toHaveBeenCalledWith('alice');
    expect(remote0GetBalance).not.toHaveBeenCalled();
    local1GetBalance.mockClear();

    // bob: only remote matches (stalk=1, lift not invoked)
    await E(wallet).getBalance('bob');
    expect(remote0GetBalance).toHaveBeenCalledWith('bob');
    expect(local1GetBalance).not.toHaveBeenCalled();
    remote0GetBalance.mockClear();

    // Expand with a broader local cache (cost=2), re-sheafify.
    const local2GetBalance = vi.fn((_acct: string): number => 0);
    sections.push({
      exo: makeSection(
        'Wallet:2',
        M.interface('Wallet:2', {
          getBalance: M.call(M.string()).returns(M.number()),
        }),
        { getBalance: local2GetBalance },
      ),
      metadata: constant({ cost: 2 }),
    });
    wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      lift: argmin,
    });

    // bob: now remote (cost=100) and new local (cost=2) both match, argmin picks cost=2
    await E(wallet).getBalance('bob');
    expect(local2GetBalance).toHaveBeenCalledWith('bob');
    expect(remote0GetBalance).not.toHaveBeenCalled();
    local2GetBalance.mockClear();

    // alice: three sections match, argmin still picks cost=1
    await E(wallet).getBalance('alice');
    expect(local1GetBalance).toHaveBeenCalledWith('alice');
    expect(remote0GetBalance).not.toHaveBeenCalled();
    expect(local2GetBalance).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// E2E: multi-tier capability routing
// ---------------------------------------------------------------------------

describe('e2e: multi-tier capability routing', () => {
  // A wallet integrates multiple data sources. Each declares its coverage
  // via guards and carries latency metadata. The sheaf routes every call
  // to the fastest matching source — no manual if/else, no strategy
  // registration, just:
  //   guards (what can handle it)  +  metadata (how fast)  +  lift (pick best)

  type Tier = { latencyMs: number; label: string };

  const fastest: Lift<Tier> = async function* (germs) {
    yield* [...germs].sort(
      (a, b) =>
        (a.metadata?.latencyMs ?? Infinity) -
        (b.metadata?.latencyMs ?? Infinity),
    );
  };

  it('routes reads to the fastest matching tier and writes to the only capable section', async () => {
    // Shared ledger — all sections read from this, so the sheaf condition
    // (effect-equivalence) holds by construction.
    const ledger: Record<string, number> = {
      alice: 1000,
      bob: 500,
      carol: 250,
    };

    const networkGetBalance = vi.fn(
      (acct: string): number => ledger[acct] ?? 0,
    );
    const localGetBalance = vi.fn((_acct: string): number => ledger.alice ?? 0);
    const cacheGetBalance = vi.fn((acct: string): number => ledger[acct] ?? 0);
    const writeBackendGetBalance = vi.fn(
      (acct: string): number => ledger[acct] ?? 0,
    );
    const writeBackendTransfer = vi.fn(
      (from: string, to: string, amt: number): boolean => {
        const fromBal = ledger[from] ?? 0;
        if (fromBal < amt) {
          return false;
        }
        ledger[from] = fromBal - amt;
        ledger[to] = (ledger[to] ?? 0) + amt;
        return true;
      },
    );

    const sections: PresheafSection<Tier>[] = [];

    // ── Tier 1: Network RPC ──────────────────────────────────
    // Covers ALL accounts (M.string()), but slow (500ms).
    sections.push({
      exo: makeSection(
        'Wallet:0',
        M.interface('Wallet:0', {
          getBalance: M.call(M.string()).returns(M.number()),
        }),
        { getBalance: networkGetBalance },
      ),
      metadata: constant({ latencyMs: 500, label: 'network' }),
    });

    let wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      lift: fastest,
    });

    // Phase 1 — single backend: stalk is always 1, lift never fires.
    await E(wallet).getBalance('alice');
    await E(wallet).getBalance('bob');
    await E(wallet).getBalance('dave');
    expect(networkGetBalance).toHaveBeenCalledTimes(3);
    expect(networkGetBalance).toHaveBeenCalledWith('alice');
    expect(networkGetBalance).toHaveBeenCalledWith('bob');
    expect(networkGetBalance).toHaveBeenCalledWith('dave');
    networkGetBalance.mockClear();

    // ── Tier 2: Local state for owned account ────────────────
    // Only covers 'alice' (M.eq), 1ms.
    sections.push({
      exo: makeSection(
        'Wallet:1',
        M.interface('Wallet:1', {
          getBalance: M.call(M.eq('alice')).returns(M.number()),
        }),
        { getBalance: localGetBalance },
      ),
      metadata: constant({ latencyMs: 1, label: 'local' }),
    });
    wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      lift: fastest,
    });

    // Phase 2 — alice routes to local (1ms < 500ms), bob still hits network.
    await E(wallet).getBalance('alice');
    await E(wallet).getBalance('bob');
    expect(localGetBalance).toHaveBeenCalledWith('alice');
    expect(networkGetBalance).toHaveBeenCalledWith('bob');
    expect(networkGetBalance).not.toHaveBeenCalledWith('alice');
    expect(localGetBalance).not.toHaveBeenCalledWith('bob');
    localGetBalance.mockClear();
    networkGetBalance.mockClear();

    // ── Tier 3: In-memory cache for specific accounts ────────
    // Covers bob and carol via M.or, instant (0ms).
    sections.push({
      exo: makeSection(
        'Wallet:2',
        M.interface('Wallet:2', {
          getBalance: M.call(M.or(M.eq('bob'), M.eq('carol'))).returns(
            M.number(),
          ),
        }),
        { getBalance: cacheGetBalance },
      ),
      metadata: constant({ latencyMs: 0, label: 'cache' }),
    });
    wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      lift: fastest,
    });

    // Phase 3 — every known account hits its optimal tier.
    await E(wallet).getBalance('alice'); // local  (1ms)
    await E(wallet).getBalance('bob'); //   cache  (0ms)
    await E(wallet).getBalance('carol'); // cache  (0ms)
    await E(wallet).getBalance('dave'); //  network (only match)
    expect(localGetBalance).toHaveBeenCalledWith('alice');
    expect(cacheGetBalance).toHaveBeenCalledWith('bob');
    expect(cacheGetBalance).toHaveBeenCalledWith('carol');
    expect(networkGetBalance).toHaveBeenCalledWith('dave');
    expect(networkGetBalance).toHaveBeenCalledTimes(1);
    expect(localGetBalance).toHaveBeenCalledTimes(1);
    expect(cacheGetBalance).toHaveBeenCalledTimes(2);
    localGetBalance.mockClear();
    cacheGetBalance.mockClear();
    networkGetBalance.mockClear();

    // ── Tier 4: Heterogeneous methods ────────────────────────
    // A write-capable section that declares `transfer`. None of the
    // read-only tiers above declared it, so writes route here
    // automatically — the guard algebra handles it, no config needed.
    sections.push({
      exo: makeSection(
        'Wallet:3',
        M.interface('Wallet:3', {
          getBalance: M.call(M.string()).returns(M.number()),
          transfer: M.call(M.string(), M.string(), M.number()).returns(
            M.boolean(),
          ),
        }),
        {
          getBalance: writeBackendGetBalance,
          transfer: writeBackendTransfer,
        },
      ),
      metadata: constant({ latencyMs: 200, label: 'write-backend' }),
    });
    wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      lift: fastest,
    });

    // transfer: only write-backend declares it → stalk=1, lift bypassed.
    const facade = wallet as unknown as Record<
      string,
      (...args: unknown[]) => unknown
    >;
    await E(facade).transfer('alice', 'dave', 100);
    expect(writeBackendTransfer).toHaveBeenCalledWith('alice', 'dave', 100);
    writeBackendTransfer.mockClear();

    // The shared ledger is mutated. All tiers see the new state because
    // they all close over the same ledger (sheaf condition by construction).
    await E(wallet).getBalance('alice'); // local (1ms), was 1000
    await E(wallet).getBalance('dave'); //  write-backend (200ms < 500ms for dave)
    await E(wallet).getBalance('bob'); //   cache, unchanged
    expect(localGetBalance).toHaveBeenCalledWith('alice');
    expect(writeBackendGetBalance).toHaveBeenCalledWith('dave');
    expect(cacheGetBalance).toHaveBeenCalledWith('bob');
    expect(ledger.alice).toBe(900);
    expect(ledger.dave).toBe(100);
    expect(ledger.bob).toBe(500);
  });

  it('same germ structure, different lifts, different routing', async () => {
    // The lift is the operational policy — swap it and the same
    // set of sections produces different routing behavior.
    const networkGetBalance = vi.fn((_acct: string): number => 0);
    const mirrorGetBalance = vi.fn((_acct: string): number => 0);

    const makeSections = (): PresheafSection<Tier>[] => [
      {
        exo: makeSection(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: networkGetBalance },
        ),
        metadata: constant({ latencyMs: 500, label: 'network' }),
      },
      {
        exo: makeSection(
          'Wallet:1',
          M.interface('Wallet:1', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: mirrorGetBalance },
        ),
        metadata: constant({ latencyMs: 50, label: 'mirror' }),
      },
    ];

    // Policy A: fastest wins (mirror at 50ms < network at 500ms).
    const walletA = sheafify({
      name: 'Wallet',
      sections: makeSections(),
    }).getGlobalSection({ lift: fastest });
    await E(walletA).getBalance('alice');
    expect(mirrorGetBalance).toHaveBeenCalledWith('alice');
    expect(networkGetBalance).not.toHaveBeenCalled();
    mirrorGetBalance.mockClear();

    // Policy B: highest latency wins (simulate "prefer-canonical-source").
    const slowest: Lift<Tier> = async function* (germs) {
      yield* [...germs].sort(
        (a, b) => (b.metadata?.latencyMs ?? 0) - (a.metadata?.latencyMs ?? 0),
      );
    };
    const walletB = sheafify({
      name: 'Wallet',
      sections: makeSections(),
    }).getGlobalSection({ lift: slowest });
    await E(walletB).getBalance('alice');
    expect(networkGetBalance).toHaveBeenCalledWith('alice');
    expect(mirrorGetBalance).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// E2E: preferAutonomous recovered as degenerate case
// ---------------------------------------------------------------------------

describe('e2e: preferAutonomous recovered as degenerate case', () => {
  it('binary push metadata recovers push-pull lift rule', async () => {
    const preferPush: Lift<{ push: boolean }> = async function* (germs) {
      yield* germs.filter((germ) => germ.metadata?.push);
      yield* germs.filter((germ) => !germ.metadata?.push);
    };

    const pullGetBalance = vi.fn((_acct: string): number => 0);
    const pushGetBalance = vi.fn((_acct: string): number => 0);

    const sections: PresheafSection<{ push: boolean }>[] = [
      {
        // Pull section: M.string() guards, push=false
        exo: makeSection(
          'PushPull:0',
          M.interface('PushPull:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: pullGetBalance },
        ),
        metadata: constant({ push: false }),
      },
      {
        // Push section: narrow guard, push=true
        exo: makeSection(
          'PushPull:1',
          M.interface('PushPull:1', {
            getBalance: M.call(M.eq('alice')).returns(M.number()),
          }),
          { getBalance: pushGetBalance },
        ),
        metadata: constant({ push: true }),
      },
    ];

    const wallet = sheafify({ name: 'PushPull', sections }).getGlobalSection({
      lift: preferPush,
    });

    // alice: both match, preferPush picks push section
    await E(wallet).getBalance('alice');
    expect(pushGetBalance).toHaveBeenCalledWith('alice');
    expect(pullGetBalance).not.toHaveBeenCalled();
    pushGetBalance.mockClear();

    // bob: only pull matches (stalk=1, lift bypassed)
    await E(wallet).getBalance('bob');
    expect(pullGetBalance).toHaveBeenCalledWith('bob');
    expect(pushGetBalance).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// E2E: callable metadata — cost varies with invocation args
// ---------------------------------------------------------------------------

describe('e2e: callable metadata — cost varies with invocation args', () => {
  // Two swap sections whose cost is a function of the swap amount.
  // Swap A is cheaper for small amounts; Swap B is cheaper for large amounts.
  // Breakeven ≈ 90.9 (1 + 0.1x = 10 + 0.001x → 0.099x = 9 → x ≈ 90.9)

  type SwapCost = { cost: number };

  const cheapest: Lift<SwapCost> = async function* (germs) {
    yield* [...germs].sort(
      (a, b) => (a.metadata?.cost ?? Infinity) - (b.metadata?.cost ?? Infinity),
    );
  };

  it('routes swap(50) to A and swap(100) to B based on callable cost metadata', async () => {
    const swapAFn = vi.fn(
      (_amount: number, _from: string, _to: string): boolean => true,
    );
    const swapBFn = vi.fn(
      (_amount: number, _from: string, _to: string): boolean => true,
    );

    const sections: PresheafSection<SwapCost>[] = [
      {
        exo: makeSection(
          'SwapA',
          M.interface('SwapA', {
            swap: M.call(M.number(), M.string(), M.string()).returns(
              M.boolean(),
            ),
          }),
          { swap: swapAFn },
        ),
        // cost(amount) = 1 + 0.1 * amount
        metadata: callable((args) => ({
          cost: 1 + 0.1 * (args[0] as number),
        })),
      },
      {
        exo: makeSection(
          'SwapB',
          M.interface('SwapB', {
            swap: M.call(M.number(), M.string(), M.string()).returns(
              M.boolean(),
            ),
          }),
          { swap: swapBFn },
        ),
        // cost(amount) = 10 + 0.001 * amount
        metadata: callable((args) => ({
          cost: 10 + 0.001 * (args[0] as number),
        })),
      },
    ];

    const facade = sheafify({ name: 'Swap', sections }).getGlobalSection({
      lift: cheapest,
    }) as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;

    // swap(50): A costs 6, B costs 10.05 → A wins
    await facade.swap(50, 'FUZ', 'BIZ');
    expect(swapAFn).toHaveBeenCalledWith(50, 'FUZ', 'BIZ');
    expect(swapBFn).not.toHaveBeenCalled();
    swapAFn.mockClear();

    // swap(100): A costs 11, B costs 10.1 → B wins
    await facade.swap(100, 'FUZ', 'BIZ');
    expect(swapBFn).toHaveBeenCalledWith(100, 'FUZ', 'BIZ');
    expect(swapAFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// E2E: lift retry — first candidate throws, sheaf recovers to fallback
// ---------------------------------------------------------------------------

describe('e2e: lift retry on handler failure', () => {
  it('recovers to next candidate when first throws, lift receives non-empty errors', async () => {
    type RouteMeta = { priority: number };

    const primaryFn = vi.fn((_acct: string): number => {
      throw new Error('primary unavailable');
    });
    const fallbackFn = vi.fn((_acct: string): number => 99);

    const sections: PresheafSection<RouteMeta>[] = [
      {
        exo: makeSection(
          'Primary',
          M.interface('Primary', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: primaryFn },
        ),
        metadata: constant({ priority: 0 }),
      },
      {
        exo: makeSection(
          'Fallback',
          M.interface('Fallback', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: fallbackFn },
        ),
        metadata: constant({ priority: 1 }),
      },
    ];

    // Track the error-array length the lift receives after each failed attempt.
    const errorCountsSeenByLift: number[] = [];
    const priorityFirst: Lift<RouteMeta> = async function* (germs) {
      const ordered = [...germs].sort(
        (a, b) => (a.metadata?.priority ?? 0) - (b.metadata?.priority ?? 0),
      );
      for (const germ of ordered) {
        const errors: unknown[] = yield germ;
        errorCountsSeenByLift.push(errors.length);
      }
    };

    const wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      lift: priorityFirst,
    });

    const result = await E(wallet).getBalance('alice');

    // fallback succeeded and both handlers were invoked
    expect(result).toBe(99);
    expect(primaryFn).toHaveBeenCalledWith('alice');
    expect(fallbackFn).toHaveBeenCalledWith('alice');

    // after the primary failed the lift received an errors array with one entry
    expect(errorCountsSeenByLift).toHaveLength(1);
    expect(errorCountsSeenByLift[0]).toBe(1);
  });

  it('lift receives error snapshots not live references', async () => {
    type RouteMeta = { priority: number };

    const handlers = [
      vi.fn((_acct: string): number => {
        throw new Error('handler 0 failed');
      }),
      vi.fn((_acct: string): number => {
        throw new Error('handler 1 failed');
      }),
      vi.fn((_acct: string): number => 99),
    ];

    const sections: PresheafSection<RouteMeta>[] = handlers.map((fn, i) => ({
      exo: makeSection(
        `Section:${i}`,
        M.interface(`Section:${i}`, {
          getBalance: M.call(M.string()).returns(M.number()),
        }),
        { getBalance: fn },
      ),
      metadata: constant({ priority: i }),
    }));

    let errorsAfterFirst: unknown[] | undefined;
    const priorityFirst: Lift<RouteMeta> = async function* (germs) {
      const ordered = [...germs].sort(
        (a, b) => (a.metadata?.priority ?? 0) - (b.metadata?.priority ?? 0),
      );
      for (const germ of ordered) {
        const errors: unknown[] = yield germ;
        errorsAfterFirst ??= errors;
      }
    };

    const wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      lift: priorityFirst,
    });

    await E(wallet).getBalance('alice');

    // After the first handler fails and the second handler is attempted,
    // the errors array grows. errorsAfterFirst should be a snapshot with
    // exactly one entry — not a live reference that was later mutated to two.
    expect(errorsAfterFirst).toHaveLength(1);
  });

  it('throws accumulated errors when all candidates fail', async () => {
    type RouteMeta = { priority: number };

    const sections: PresheafSection<RouteMeta>[] = [
      {
        exo: makeSection(
          'A',
          M.interface('A', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          {
            getBalance: (_acct: string): number => {
              throw new Error('A failed');
            },
          },
        ),
        metadata: constant({ priority: 0 }),
      },
      {
        exo: makeSection(
          'B',
          M.interface('B', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          {
            getBalance: (_acct: string): number => {
              throw new Error('B failed');
            },
          },
        ),
        metadata: constant({ priority: 1 }),
      },
    ];

    const wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      async *lift(germs) {
        yield* [...germs].sort(
          (a, b) => (a.metadata?.priority ?? 0) - (b.metadata?.priority ?? 0),
        );
      },
    });

    await expect(E(wallet).getBalance('alice')).rejects.toThrow(
      'No viable section',
    );
  });
});
