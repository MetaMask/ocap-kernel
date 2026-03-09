import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { describe, it, expect } from 'vitest';

import { sheafify } from './sheafify.ts';
import type { Lift, PresheafSection, Section } from './types.ts';

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
    const argmin: Lift<{ cost: number }> = async (germs) =>
      Promise.resolve(
        germs.reduce(
          (bestIdx, entry, idx) =>
            (entry.metadata?.cost ?? Infinity) <
            (germs[bestIdx]!.metadata?.cost ?? Infinity)
              ? idx
              : bestIdx,
          0,
        ),
      );

    const sections: PresheafSection<{ cost: number }>[] = [
      {
        // Remote: covers all accounts, expensive
        exo: makeExo(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (acct: string) => (acct === 'alice' ? 1000 : 500) },
        ) as unknown as Section,
        metadata: { cost: 100 },
      },
      {
        // Local cache: covers only 'alice', cheap
        exo: makeExo(
          'Wallet:1',
          M.interface('Wallet:1', {
            getBalance: M.call(M.eq('alice')).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 1000 },
        ) as unknown as Section,
        metadata: { cost: 1 },
      },
    ];

    let wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      lift: argmin,
    });

    // alice: both sections match, argmin picks local (cost=1)
    expect(await E(wallet).getBalance('alice')).toBe(1000);

    // bob: only remote matches (stalk=1, lift not invoked)
    expect(await E(wallet).getBalance('bob')).toBe(500);

    // Expand with a broader local cache (cost=2), re-sheafify.
    sections.push({
      exo: makeExo(
        'Wallet:2',
        M.interface('Wallet:2', {
          getBalance: M.call(M.string()).returns(M.number()),
        }),
        { getBalance: (acct: string) => (acct === 'alice' ? 1000 : 500) },
      ) as unknown as Section,
      metadata: { cost: 2 },
    });
    wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      lift: argmin,
    });

    // bob: now remote (cost=100) and new local (cost=2) both match, argmin picks cost=2
    expect(await E(wallet).getBalance('bob')).toBe(500);

    // alice: three sections match, argmin still picks cost=1
    expect(await E(wallet).getBalance('alice')).toBe(1000);
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

  const fastest: Lift<Tier> = async (germs) =>
    Promise.resolve(
      germs.reduce(
        (bestIdx, entry, idx) =>
          (entry.metadata?.latencyMs ?? Infinity) <
          (germs[bestIdx]!.metadata?.latencyMs ?? Infinity)
            ? idx
            : bestIdx,
        0,
      ),
    );

  it('routes reads to the fastest matching tier and writes to the only capable section', async () => {
    // Dispatch log — sections push their label on every call so we can
    // observe which tier actually handled each request.
    const log: string[] = [];

    // Shared ledger — all sections read from this, so the sheaf condition
    // (effect-equivalence) holds by construction.
    const ledger: Record<string, number> = {
      alice: 1000,
      bob: 500,
      carol: 250,
    };

    const sections: PresheafSection<Tier>[] = [];

    // ── Tier 1: Network RPC ──────────────────────────────────
    // Covers ALL accounts (M.string()), but slow (500ms).
    sections.push({
      exo: makeExo(
        'Wallet:0',
        M.interface('Wallet:0', {
          getBalance: M.call(M.string()).returns(M.number()),
        }),
        {
          getBalance: (acct: string) => {
            log.push('network');
            return ledger[acct] ?? 0;
          },
        },
      ) as unknown as Section,
      metadata: { latencyMs: 500, label: 'network' },
    });

    let wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      lift: fastest,
    });

    // Phase 1 — single backend: stalk is always 1, lift never fires.
    expect(await E(wallet).getBalance('alice')).toBe(1000);
    expect(await E(wallet).getBalance('bob')).toBe(500);
    expect(await E(wallet).getBalance('dave')).toBe(0);
    expect(log).toStrictEqual(['network', 'network', 'network']);
    log.length = 0;

    // ── Tier 2: Local state for owned account ────────────────
    // Only covers 'alice' (M.eq), 1ms.
    sections.push({
      exo: makeExo(
        'Wallet:1',
        M.interface('Wallet:1', {
          getBalance: M.call(M.eq('alice')).returns(M.number()),
        }),
        {
          getBalance: (_acct: string) => {
            log.push('local');
            return ledger.alice ?? 0;
          },
        },
      ) as unknown as Section,
      metadata: { latencyMs: 1, label: 'local' },
    });
    wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      lift: fastest,
    });

    // Phase 2 — alice routes to local (1ms < 500ms), bob still hits network.
    expect(await E(wallet).getBalance('alice')).toBe(1000);
    expect(await E(wallet).getBalance('bob')).toBe(500);
    expect(log).toStrictEqual(['local', 'network']);
    log.length = 0;

    // ── Tier 3: In-memory cache for specific accounts ────────
    // Covers bob and carol via M.or, instant (0ms).
    sections.push({
      exo: makeExo(
        'Wallet:2',
        M.interface('Wallet:2', {
          getBalance: M.call(M.or(M.eq('bob'), M.eq('carol'))).returns(
            M.number(),
          ),
        }),
        {
          getBalance: (acct: string) => {
            log.push('cache');
            return ledger[acct] ?? 0;
          },
        },
      ) as unknown as Section,
      metadata: { latencyMs: 0, label: 'cache' },
    });
    wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      lift: fastest,
    });

    // Phase 3 — every known account hits its optimal tier.
    expect(await E(wallet).getBalance('alice')).toBe(1000); // local  (1ms)
    expect(await E(wallet).getBalance('bob')).toBe(500); //    cache  (0ms)
    expect(await E(wallet).getBalance('carol')).toBe(250); //  cache  (0ms)
    expect(await E(wallet).getBalance('dave')).toBe(0); //     network (only match)
    expect(log).toStrictEqual(['local', 'cache', 'cache', 'network']);
    log.length = 0;

    // ── Tier 4: Heterogeneous methods ────────────────────────
    // A write-capable section that declares `transfer`. None of the
    // read-only tiers above declared it, so writes route here
    // automatically — the guard algebra handles it, no config needed.
    sections.push({
      exo: makeExo(
        'Wallet:3',
        M.interface('Wallet:3', {
          getBalance: M.call(M.string()).returns(M.number()),
          transfer: M.call(M.string(), M.string(), M.number()).returns(
            M.boolean(),
          ),
        }),
        {
          getBalance: (acct: string) => {
            log.push('write-backend');
            return ledger[acct] ?? 0;
          },
          transfer: (from: string, to: string, amt: number) => {
            log.push('write-backend');
            const fromBal = ledger[from] ?? 0;
            if (fromBal < amt) {
              return false;
            }
            ledger[from] = fromBal - amt;
            ledger[to] = (ledger[to] ?? 0) + amt;
            return true;
          },
        },
      ) as unknown as Section,
      metadata: { latencyMs: 200, label: 'write-backend' },
    });
    wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      lift: fastest,
    });

    // transfer: only write-backend declares it → stalk=1, lift bypassed.
    const facade = wallet as unknown as Record<
      string,
      (...args: unknown[]) => unknown
    >;
    expect(await E(facade).transfer('alice', 'dave', 100)).toBe(true);
    expect(log).toStrictEqual(['write-backend']);
    log.length = 0;

    // The shared ledger is mutated. All tiers see the new state because
    // they all close over the same ledger (sheaf condition by construction).
    expect(await E(wallet).getBalance('alice')).toBe(900); //  local (1ms), was 1000
    expect(await E(wallet).getBalance('dave')).toBe(100); //   write-backend (200ms < 500ms)
    expect(await E(wallet).getBalance('bob')).toBe(500); //    cache, unchanged
    expect(log).toStrictEqual(['local', 'write-backend', 'cache']);
  });

  it('same germ structure, different lifts, different routing', async () => {
    // The lift is the operational policy — swap it and the same
    // set of sections produces different routing behavior.
    const ledger: Record<string, number> = { alice: 1000, bob: 500 };

    const build = (lift: Lift<Tier>) => {
      const log: string[] = [];
      const sections: PresheafSection<Tier>[] = [
        {
          exo: makeExo(
            'Wallet:0',
            M.interface('Wallet:0', {
              getBalance: M.call(M.string()).returns(M.number()),
            }),
            {
              getBalance: (acct: string) => {
                log.push('network');
                return ledger[acct] ?? 0;
              },
            },
          ) as unknown as Section,
          metadata: { latencyMs: 500, label: 'network' },
        },
        {
          exo: makeExo(
            'Wallet:1',
            M.interface('Wallet:1', {
              getBalance: M.call(M.string()).returns(M.number()),
            }),
            {
              getBalance: (acct: string) => {
                log.push('mirror');
                return ledger[acct] ?? 0;
              },
            },
          ) as unknown as Section,
          metadata: { latencyMs: 50, label: 'mirror' },
        },
      ];

      return {
        wallet: sheafify({ name: 'Wallet', sections }).getGlobalSection({
          lift,
        }),
        log,
      };
    };

    // Policy A: fastest wins (mirror at 50ms < network at 500ms).
    const { wallet: walletA, log: logA } = build(fastest);
    expect(await E(walletA).getBalance('alice')).toBe(1000);
    expect(logA).toStrictEqual(['mirror']);

    // Policy B: highest latency wins (simulate "prefer-canonical-source").
    const slowest: Lift<Tier> = async (germs) =>
      Promise.resolve(
        germs.reduce(
          (bestIdx, entry, idx) =>
            (entry.metadata?.latencyMs ?? 0) >
            (germs[bestIdx]!.metadata?.latencyMs ?? 0)
              ? idx
              : bestIdx,
          0,
        ),
      );
    const { wallet: walletB, log: logB } = build(slowest);
    expect(await E(walletB).getBalance('alice')).toBe(1000);
    expect(logB).toStrictEqual(['network']);
  });
});

// ---------------------------------------------------------------------------
// E2E: preferAutonomous recovered as degenerate case
// ---------------------------------------------------------------------------

describe('e2e: preferAutonomous recovered as degenerate case', () => {
  it('binary push metadata recovers push-pull lift rule', async () => {
    // Binary metadata: { push: true } = push section, { push: false } = pull
    const preferPush: Lift<{ push: boolean }> = async (germs) => {
      const pushIdx = germs.findIndex((entry) => entry.metadata?.push);
      return Promise.resolve(pushIdx >= 0 ? pushIdx : 0);
    };

    const sections: PresheafSection<{ push: boolean }>[] = [
      {
        // Pull section: M.any() guards, push=false
        exo: makeExo(
          'PushPull:0',
          M.interface('PushPull:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 999 },
        ) as unknown as Section,
        metadata: { push: false },
      },
      {
        // Push section: narrow guard, push=true
        exo: makeExo(
          'PushPull:1',
          M.interface('PushPull:1', {
            getBalance: M.call(M.eq('alice')).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 42 },
        ) as unknown as Section,
        metadata: { push: true },
      },
    ];

    const wallet = sheafify({ name: 'PushPull', sections }).getGlobalSection({
      lift: preferPush,
    });

    // alice: both match, preferPush picks push section
    expect(await E(wallet).getBalance('alice')).toBe(42);

    // bob: only pull matches (stalk=1, lift bypassed)
    expect(await E(wallet).getBalance('bob')).toBe(999);
  });
});
