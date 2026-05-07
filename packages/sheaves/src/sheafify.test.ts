import { GET_INTERFACE_GUARD } from '@endo/exo';
import { M, getInterfaceGuardPayload } from '@endo/patterns';
import { GET_DESCRIPTION } from '@metamask/kernel-utils';
import { describe, it, expect } from 'vitest';

import { constant } from './metadata.ts';
import { makeHandler } from './section.ts';
import { sheafify } from './sheafify.ts';
import type { Candidate, Policy, PolicyContext, Provider } from './types.ts';

// Thin cast for calling exo methods directly in tests without going through
// HandledPromise (which is not available in the test environment).
// eslint-disable-next-line id-length
const E = (obj: unknown) =>
  obj as Record<string, (...args: unknown[]) => Promise<unknown>>;

// ---------------------------------------------------------------------------
// Unit: sheafify
// ---------------------------------------------------------------------------

describe('sheafify', () => {
  it('single-section bypass: lift not invoked', async () => {
    let liftCalled = false;
    // eslint-disable-next-line require-yield
    const lift: Policy<{ cost: number }> = async function* (_candidates) {
      liftCalled = true;
      // unreachable — fast path bypasses lift for single section
    };

    const providers: Provider<{ cost: number }>[] = [
      {
        handler: makeHandler(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 42 },
        ),
        metadata: constant({ cost: 1 }),
      },
    ];

    const wallet = sheafify({ name: 'Wallet', providers }).getGlobalSection({
      lift,
    });
    expect(await E(wallet).getBalance('alice')).toBe(42);
    expect(liftCalled).toBe(false);
  });

  it('zero-coverage throws', async () => {
    const providers: Provider<{ cost: number }>[] = [
      {
        handler: makeHandler(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.eq('alice')).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 42 },
        ),
        metadata: constant({ cost: 1 }),
      },
    ];

    const wallet = sheafify({ name: 'Wallet', providers }).getGlobalSection({
      async *lift(_candidates) {
        // unreachable — zero-coverage path throws before reaching lift
      },
    });
    await expect(E(wallet).getBalance('bob')).rejects.toThrow(
      'No handler covers',
    );
  });

  it('lift receives metadata and picks winner', async () => {
    const argmin: Policy<{ cost: number }> = async function* (candidates) {
      yield* [...candidates].sort(
        (a, b) =>
          (a.metadata?.cost ?? Infinity) - (b.metadata?.cost ?? Infinity),
      );
    };

    const providers: Provider<{ cost: number }>[] = [
      {
        handler: makeHandler(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 100 },
        ),
        metadata: constant({ cost: 100 }),
      },
      {
        handler: makeHandler(
          'Wallet:1',
          M.interface('Wallet:1', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 42 },
        ),
        metadata: constant({ cost: 1 }),
      },
    ];

    const wallet = sheafify({ name: 'Wallet', providers }).getGlobalSection({
      lift: argmin,
    });
    // argmin picks cost=1 section which returns 42
    expect(await E(wallet).getBalance('alice')).toBe(42);
  });

  // eslint-disable-next-line vitest/prefer-lowercase-title
  it('GET_INTERFACE_GUARD returns collected guard', () => {
    const providers: Provider<{ cost: number }>[] = [
      {
        handler: makeHandler(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.eq('alice')).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 100 },
        ),
        metadata: constant({ cost: 100 }),
      },
      {
        handler: makeHandler(
          'Wallet:1',
          M.interface('Wallet:1', {
            getBalance: M.call(M.eq('bob')).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 50 },
        ),
        metadata: constant({ cost: 1 }),
      },
    ];

    const wallet = sheafify({ name: 'Wallet', providers }).getGlobalSection({
      async *lift(candidates) {
        yield candidates[0]!;
      },
    });
    const guard = wallet[GET_INTERFACE_GUARD]();
    expect(guard).toBeDefined();

    const { methodGuards } = getInterfaceGuardPayload(guard);
    expect(methodGuards).toHaveProperty('getBalance');
  });

  it('re-sheafification picks up new providers and methods', async () => {
    const argmin: Policy<{ cost: number }> = async function* (candidates) {
      yield* [...candidates].sort(
        (a, b) =>
          (a.metadata?.cost ?? Infinity) - (b.metadata?.cost ?? Infinity),
      );
    };

    const providers: Provider<{ cost: number }>[] = [
      {
        handler: makeHandler(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 100 },
        ),
        metadata: constant({ cost: 100 }),
      },
    ];

    let wallet = sheafify({ name: 'Wallet', providers }).getGlobalSection({
      lift: argmin,
    });
    expect(await E(wallet).getBalance('alice')).toBe(100);

    // Add a cheaper provider with a new method to the providers array, re-sheafify.
    providers.push({
      handler: makeHandler(
        'Wallet:1',
        M.interface('Wallet:1', {
          getBalance: M.call(M.string()).returns(M.number()),
          transfer: M.call(M.string(), M.string(), M.number()).returns(
            M.boolean(),
          ),
        }),
        {
          getBalance: (_acct: string) => 42,
          transfer: (_from: string, _to: string, _amt: number) => true,
        },
      ),
      metadata: constant({ cost: 1 }),
    });
    wallet = sheafify({ name: 'Wallet', providers }).getGlobalSection({
      lift: argmin,
    });

    // argmin picks the cheaper section
    expect(await E(wallet).getBalance('alice')).toBe(42);
    // New method is available on the re-sheafified facade
    const facade = wallet as unknown as Record<
      string,
      (...args: unknown[]) => unknown
    >;
    expect(await E(facade).transfer('alice', 'bob', 10)).toBe(true);
  });

  it('pre-built exo dispatches correctly', async () => {
    const handler = makeHandler(
      'bal',
      M.interface('bal', {
        getBalance: M.call(M.string()).returns(M.number()),
      }),
      { getBalance: (_acct: string) => 42 },
    );
    const providers: Provider<{ cost: number }>[] = [
      { handler, metadata: constant({ cost: 1 }) },
    ];

    const wallet = sheafify({ name: 'Wallet', providers }).getGlobalSection({
      async *lift(candidates) {
        yield candidates[0]!;
      },
    });
    expect(await E(wallet).getBalance('alice')).toBe(42);
  });

  it('re-sheafification with pre-built exo picks up new methods', async () => {
    const argmin: Policy<{ cost: number }> = async function* (candidates) {
      yield* [...candidates].sort(
        (a, b) =>
          (a.metadata?.cost ?? Infinity) - (b.metadata?.cost ?? Infinity),
      );
    };

    const providers: Provider<{ cost: number }>[] = [
      {
        handler: makeHandler(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 100 },
        ),
        metadata: constant({ cost: 100 }),
      },
    ];

    let wallet = sheafify({ name: 'Wallet', providers }).getGlobalSection({
      lift: argmin,
    });
    expect(await E(wallet).getBalance('alice')).toBe(100);

    // Add a pre-built exo with a cheaper getBalance + new transfer method
    const handler = makeHandler(
      'cheap',
      M.interface('cheap', {
        getBalance: M.call(M.string()).returns(M.number()),
        transfer: M.call(M.string(), M.string(), M.number()).returns(
          M.boolean(),
        ),
      }),
      {
        getBalance: (_acct: string) => 42,
        transfer: (_from: string, _to: string, _amt: number) => true,
      },
    );
    providers.push({
      handler,
      metadata: constant({ cost: 1 }),
    });
    wallet = sheafify({ name: 'Wallet', providers }).getGlobalSection({
      lift: argmin,
    });

    // argmin picks the cheaper section
    expect(await E(wallet).getBalance('alice')).toBe(42);
    // New method is available on the re-sheafified facade
    const facade = wallet as unknown as Record<
      string,
      (...args: unknown[]) => unknown
    >;
    expect(await E(facade).transfer('alice', 'bob', 10)).toBe(true);
  });

  it('guard reflected in GET_INTERFACE_GUARD for pre-built exo', () => {
    const handler = makeHandler(
      'bal',
      M.interface('bal', {
        getBalance: M.call(M.string()).returns(M.number()),
      }),
      { getBalance: (_acct: string) => 42 },
    );
    const providers: Provider<{ cost: number }>[] = [
      { handler, metadata: constant({ cost: 1 }) },
    ];

    const wallet = sheafify({ name: 'Wallet', providers }).getGlobalSection({
      async *lift(candidates) {
        yield candidates[0]!;
      },
    });
    const guard = wallet[GET_INTERFACE_GUARD]();
    expect(guard).toBeDefined();

    const { methodGuards } = getInterfaceGuardPayload(guard);
    expect(methodGuards).toHaveProperty('getBalance');
  });

  it('lift receives constraints in context and only distinguishing metadata', async () => {
    type Meta = { region: string; cost: number };
    let capturedCandidates: Candidate<Partial<Meta>>[] = [];
    let capturedContext: PolicyContext<Meta> | undefined;

    const spy: Policy<Meta> = async function* (candidates, context) {
      capturedCandidates = candidates;
      capturedContext = context;
      yield candidates[0]!;
    };

    const providers: Provider<Meta>[] = [
      {
        handler: makeHandler(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 100 },
        ),
        metadata: constant({ region: 'us', cost: 100 }),
      },
      {
        handler: makeHandler(
          'Wallet:1',
          M.interface('Wallet:1', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 42 },
        ),
        metadata: constant({ region: 'us', cost: 1 }),
      },
    ];

    const wallet = sheafify({ name: 'Wallet', providers }).getGlobalSection({
      lift: spy,
    });
    await E(wallet).getBalance('alice');

    expect(capturedContext).toStrictEqual({
      method: 'getBalance',
      args: ['alice'],
      constraints: { region: 'us' },
    });
    expect(
      capturedCandidates.map((candidate) => candidate.metadata),
    ).toStrictEqual([{ cost: 100 }, { cost: 1 }]);
  });

  it('all-shared metadata yields empty distinguishing metadata', async () => {
    type Meta = { region: string };
    let capturedCandidates: Candidate<Partial<Meta>>[] = [];
    let capturedContext: PolicyContext<Meta> | undefined;

    const spy: Policy<Meta> = async function* (candidates, context) {
      capturedCandidates = candidates;
      capturedContext = context;
      yield candidates[0]!;
    };

    const providers: Provider<Meta>[] = [
      {
        handler: makeHandler(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 100 },
        ),
        metadata: constant({ region: 'us' }),
      },
      {
        handler: makeHandler(
          'Wallet:1',
          M.interface('Wallet:1', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 42 },
        ),
        metadata: constant({ region: 'us' }),
      },
    ];

    const wallet = sheafify({ name: 'Wallet', providers }).getGlobalSection({
      lift: spy,
    });
    await E(wallet).getBalance('alice');

    // Both providers collapsed to one candidate → policy not invoked
    expect(capturedContext).toBeUndefined();
    expect(capturedCandidates).toHaveLength(0);
  });

  it('collapses equivalent providers by metadata', async () => {
    type Meta = { cost: number };
    let liftCalled = false;

    const providers: Provider<Meta>[] = [
      {
        handler: makeHandler(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 100 },
        ),
        metadata: constant({ cost: 1 }),
      },
      {
        handler: makeHandler(
          'Wallet:1',
          M.interface('Wallet:1', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 42 },
        ),
        metadata: constant({ cost: 1 }),
      },
    ];

    const wallet = sheafify({ name: 'Wallet', providers }).getGlobalSection({
      // eslint-disable-next-line require-yield
      async *lift(_candidates) {
        liftCalled = true;
      },
    });
    await E(wallet).getBalance('alice');

    // Both providers have identical metadata → collapsed to one candidate → policy bypassed
    expect(liftCalled).toBe(false);
  });

  it('extracts shared NaN metadata values into constraints', async () => {
    type Meta = { cost: number; priority: number };
    let capturedCandidates: Candidate<Partial<Meta>>[] = [];
    let capturedContext: PolicyContext<Meta> | undefined;

    const providers: Provider<Meta>[] = [
      {
        handler: makeHandler(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 0 },
        ),
        metadata: constant({ cost: NaN, priority: 0 }),
      },
      {
        handler: makeHandler(
          'Wallet:1',
          M.interface('Wallet:1', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 0 },
        ),
        metadata: constant({ cost: NaN, priority: 1 }),
      },
    ];

    const wallet = sheafify({ name: 'Wallet', providers }).getGlobalSection({
      async *lift(candidates, context) {
        capturedCandidates = candidates;
        capturedContext = context;
        yield candidates[0]!;
      },
    });

    await E(wallet).getBalance('alice');

    // NaN is shared across all candidates, so it should be extracted as a constraint
    // — not left as distinguishing metadata in each candidate's options.
    expect(Number.isNaN(capturedContext?.constraints.cost)).toBe(true);
    expect(
      capturedCandidates.map((candidate) => candidate.metadata),
    ).toStrictEqual([{ priority: 0 }, { priority: 1 }]);
  });

  it('does not collapse +0 and -0 metadata as equivalent', async () => {
    type Meta = { cost: number };
    let candidateCount = 0;

    const providers: Provider<Meta>[] = [
      {
        handler: makeHandler(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 0 },
        ),
        metadata: constant({ cost: +0 }),
      },
      {
        handler: makeHandler(
          'Wallet:1',
          M.interface('Wallet:1', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 0 },
        ),
        metadata: constant({ cost: -0 }),
      },
    ];

    const wallet = sheafify({ name: 'Wallet', providers }).getGlobalSection({
      async *lift(candidates) {
        candidateCount = candidates.length;
        yield candidates[0]!;
      },
    });

    await E(wallet).getBalance('alice');
    expect(candidateCount).toBe(2);
  });

  it('does not collapse Infinity and null metadata as equivalent', async () => {
    type Meta = { cost: number | null };
    let candidateCount = 0;

    const providers: Provider<Meta>[] = [
      {
        handler: makeHandler(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 0 },
        ),
        metadata: constant({ cost: Infinity }),
      },
      {
        handler: makeHandler(
          'Wallet:1',
          M.interface('Wallet:1', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 0 },
        ),
        metadata: constant({ cost: null }),
      },
    ];

    const wallet = sheafify({ name: 'Wallet', providers }).getGlobalSection({
      async *lift(candidates) {
        candidateCount = candidates.length;
        yield candidates[0]!;
      },
    });

    await E(wallet).getBalance('alice');
    expect(candidateCount).toBe(2);
  });

  it('collapses no-metadata and empty-object metadata as equivalent', async () => {
    type Meta = Record<string, never>;
    let liftCalled = false;

    const providers: Provider<Meta>[] = [
      {
        handler: makeHandler(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 100 },
        ),
      },
      {
        handler: makeHandler(
          'Wallet:1',
          M.interface('Wallet:1', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 42 },
        ),
        metadata: constant({}),
      },
    ];

    const wallet = sheafify({ name: 'Wallet', providers }).getGlobalSection({
      // eslint-disable-next-line require-yield
      async *lift(_candidates) {
        liftCalled = true;
      },
    });
    await E(wallet).getBalance('alice');

    expect(liftCalled).toBe(false);
  });

  it('mixed providers participate in policy', async () => {
    const argmin: Policy<{ cost: number }> = async function* (candidates) {
      yield* [...candidates].sort(
        (a, b) =>
          (a.metadata?.cost ?? Infinity) - (b.metadata?.cost ?? Infinity),
      );
    };

    const handler = makeHandler(
      'cheap',
      M.interface('cheap', {
        getBalance: M.call(M.string()).returns(M.number()),
      }),
      { getBalance: (_acct: string) => 42 },
    );
    const providers: Provider<{ cost: number }>[] = [
      {
        handler: makeHandler(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 100 },
        ),
        metadata: constant({ cost: 100 }),
      },
      { handler, metadata: constant({ cost: 1 }) },
    ];

    const wallet = sheafify({ name: 'Wallet', providers }).getGlobalSection({
      lift: argmin,
    });
    // argmin picks the exo section (cost=1)
    expect(await E(wallet).getBalance('alice')).toBe(42);
  });

  it('getDiscoverableGlobalSection exposes __getDescription__', async () => {
    const schema = {
      getBalance: {
        description: 'Get account balance.',
        args: { acct: { type: 'string' as const, description: 'Account id.' } },
        returns: { type: 'number' as const, description: 'Balance.' },
      },
    };
    const providers: Provider<Record<string, never>>[] = [
      {
        handler: makeHandler(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 42 },
        ),
      },
    ];

    const section = sheafify({
      name: 'Wallet',
      providers,
    }).getDiscoverableGlobalSection({
      async *lift(candidates) {
        yield candidates[0]!;
      },
      schema,
    });

    expect(E(section)[GET_DESCRIPTION]()).toStrictEqual(schema);
  });

  it('getSection does not expose __getDescription__', () => {
    const providers: Provider<Record<string, never>>[] = [
      {
        handler: makeHandler(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 42 },
        ),
      },
    ];

    const section = sheafify({ name: 'Wallet', providers }).getGlobalSection({
      async *lift(candidates) {
        yield candidates[0]!;
      },
    });

    expect(
      (section as Record<string, unknown>)[GET_DESCRIPTION],
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Unit: getSection with explicit guard
// ---------------------------------------------------------------------------

describe('getSection with explicit guard', () => {
  it('dispatches calls that fall within the explicit guard', async () => {
    const providers: Provider<Record<string, never>>[] = [
      {
        handler: makeHandler(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
            transfer: M.call(M.string(), M.number()).returns(M.boolean()),
          }),
          {
            getBalance: (_acct: string) => 42,
            transfer: (_to: string, _amt: number) => true,
          },
        ),
      },
    ];

    const readGuard = M.interface('ReadOnly', {
      getBalance: M.call(M.string()).returns(M.number()),
    });

    const section = sheafify({ name: 'Wallet', providers }).getSection({
      guard: readGuard,
      async *lift(candidates) {
        yield candidates[0]!;
      },
    });

    expect(await E(section).getBalance('alice')).toBe(42);
  });

  it('rejects method calls outside the explicit guard', async () => {
    const providers: Provider<Record<string, never>>[] = [
      {
        handler: makeHandler(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
            transfer: M.call(M.string(), M.number()).returns(M.boolean()),
          }),
          {
            getBalance: (_acct: string) => 42,
            transfer: (_to: string, _amt: number) => true,
          },
        ),
      },
    ];

    const readGuard = M.interface('ReadOnly', {
      getBalance: M.call(M.string()).returns(M.number()),
    });

    const section = sheafify({ name: 'Wallet', providers }).getSection({
      guard: readGuard,
      async *lift(candidates) {
        yield candidates[0]!;
      },
    });

    // makeExo only places methods from the guard on the object — transfer is absent
    expect((section as Record<string, unknown>).transfer).toBeUndefined();
  });

  it('getDiscoverableSection exposes __getDescription__ and obeys explicit guard', async () => {
    const providers: Provider<Record<string, never>>[] = [
      {
        handler: makeHandler(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
            transfer: M.call(M.string(), M.number()).returns(M.boolean()),
          }),
          {
            getBalance: (_acct: string) => 42,
            transfer: (_to: string, _amt: number) => true,
          },
        ),
      },
    ];

    const readGuard = M.interface('ReadOnly', {
      getBalance: M.call(M.string()).returns(M.number()),
    });

    const schema = { getBalance: { description: 'Get account balance.' } };

    const section = sheafify({
      name: 'Wallet',
      providers,
    }).getDiscoverableSection({
      guard: readGuard,
      async *lift(candidates) {
        yield candidates[0]!;
      },
      schema,
    });

    expect(E(section)[GET_DESCRIPTION]()).toStrictEqual(schema);
    expect(await E(section).getBalance('alice')).toBe(42);
  });
});
