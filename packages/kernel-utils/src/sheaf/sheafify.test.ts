import { GET_INTERFACE_GUARD } from '@endo/exo';
import { M, getInterfaceGuardPayload } from '@endo/patterns';
import { describe, it, expect } from 'vitest';

import { GET_DESCRIPTION } from '../discoverable.ts';
import { constant } from './metadata.ts';
import { makeSection } from './section.ts';
import { sheafify } from './sheafify.ts';
import type {
  EvaluatedSection,
  Lift,
  LiftContext,
  PresheafSection,
} from './types.ts';

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
    const lift: Lift<{ cost: number }> = async function* (_germs) {
      liftCalled = true;
      // unreachable — fast path bypasses lift for single section
    };

    const sections: PresheafSection<{ cost: number }>[] = [
      {
        exo: makeSection(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 42 },
        ),
        metadata: constant({ cost: 1 }),
      },
    ];

    const wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      lift,
    });
    expect(await E(wallet).getBalance('alice')).toBe(42);
    expect(liftCalled).toBe(false);
  });

  it('zero-coverage throws', async () => {
    const sections: PresheafSection<{ cost: number }>[] = [
      {
        exo: makeSection(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.eq('alice')).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 42 },
        ),
        metadata: constant({ cost: 1 }),
      },
    ];

    const wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      async *lift(_germs) {
        // unreachable — zero-coverage path throws before reaching lift
      },
    });
    await expect(E(wallet).getBalance('bob')).rejects.toThrow(
      'No section covers',
    );
  });

  it('lift receives metadata and picks winner', async () => {
    const argmin: Lift<{ cost: number }> = async function* (germs) {
      yield* [...germs].sort(
        (a, b) =>
          (a.metadata?.cost ?? Infinity) - (b.metadata?.cost ?? Infinity),
      );
    };

    const sections: PresheafSection<{ cost: number }>[] = [
      {
        exo: makeSection(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 100 },
        ),
        metadata: constant({ cost: 100 }),
      },
      {
        exo: makeSection(
          'Wallet:1',
          M.interface('Wallet:1', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 42 },
        ),
        metadata: constant({ cost: 1 }),
      },
    ];

    const wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      lift: argmin,
    });
    // argmin picks cost=1 section which returns 42
    expect(await E(wallet).getBalance('alice')).toBe(42);
  });

  // eslint-disable-next-line vitest/prefer-lowercase-title
  it('GET_INTERFACE_GUARD returns collected guard', () => {
    const sections: PresheafSection<{ cost: number }>[] = [
      {
        exo: makeSection(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.eq('alice')).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 100 },
        ),
        metadata: constant({ cost: 100 }),
      },
      {
        exo: makeSection(
          'Wallet:1',
          M.interface('Wallet:1', {
            getBalance: M.call(M.eq('bob')).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 50 },
        ),
        metadata: constant({ cost: 1 }),
      },
    ];

    const wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      async *lift(germs) {
        yield germs[0]!;
      },
    });
    const guard = wallet[GET_INTERFACE_GUARD]();
    expect(guard).toBeDefined();

    const { methodGuards } = getInterfaceGuardPayload(guard);
    expect(methodGuards).toHaveProperty('getBalance');
  });

  it('re-sheafification picks up new sections and methods', async () => {
    const argmin: Lift<{ cost: number }> = async function* (germs) {
      yield* [...germs].sort(
        (a, b) =>
          (a.metadata?.cost ?? Infinity) - (b.metadata?.cost ?? Infinity),
      );
    };

    const sections: PresheafSection<{ cost: number }>[] = [
      {
        exo: makeSection(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 100 },
        ),
        metadata: constant({ cost: 100 }),
      },
    ];

    let wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      lift: argmin,
    });
    expect(await E(wallet).getBalance('alice')).toBe(100);

    // Add a cheaper section with a new method to the sections array, re-sheafify.
    sections.push({
      exo: makeSection(
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
    wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
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
    const exo = makeSection(
      'bal',
      M.interface('bal', {
        getBalance: M.call(M.string()).returns(M.number()),
      }),
      { getBalance: (_acct: string) => 42 },
    );
    const sections: PresheafSection<{ cost: number }>[] = [
      { exo, metadata: constant({ cost: 1 }) },
    ];

    const wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      async *lift(germs) {
        yield germs[0]!;
      },
    });
    expect(await E(wallet).getBalance('alice')).toBe(42);
  });

  it('re-sheafification with pre-built exo picks up new methods', async () => {
    const argmin: Lift<{ cost: number }> = async function* (germs) {
      yield* [...germs].sort(
        (a, b) =>
          (a.metadata?.cost ?? Infinity) - (b.metadata?.cost ?? Infinity),
      );
    };

    const sections: PresheafSection<{ cost: number }>[] = [
      {
        exo: makeSection(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 100 },
        ),
        metadata: constant({ cost: 100 }),
      },
    ];

    let wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      lift: argmin,
    });
    expect(await E(wallet).getBalance('alice')).toBe(100);

    // Add a pre-built exo with a cheaper getBalance + new transfer method
    const exo = makeSection(
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
    sections.push({
      exo,
      metadata: constant({ cost: 1 }),
    });
    wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
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
    const exo = makeSection(
      'bal',
      M.interface('bal', {
        getBalance: M.call(M.string()).returns(M.number()),
      }),
      { getBalance: (_acct: string) => 42 },
    );
    const sections: PresheafSection<{ cost: number }>[] = [
      { exo, metadata: constant({ cost: 1 }) },
    ];

    const wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      async *lift(germs) {
        yield germs[0]!;
      },
    });
    const guard = wallet[GET_INTERFACE_GUARD]();
    expect(guard).toBeDefined();

    const { methodGuards } = getInterfaceGuardPayload(guard);
    expect(methodGuards).toHaveProperty('getBalance');
  });

  it('lift receives constraints in context and only distinguishing metadata', async () => {
    type Meta = { region: string; cost: number };
    let capturedGerms: EvaluatedSection<Partial<Meta>>[] = [];
    let capturedContext: LiftContext<Meta> | undefined;

    const spy: Lift<Meta> = async function* (germs, context) {
      capturedGerms = germs;
      capturedContext = context;
      yield germs[0]!;
    };

    const sections: PresheafSection<Meta>[] = [
      {
        exo: makeSection(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 100 },
        ),
        metadata: constant({ region: 'us', cost: 100 }),
      },
      {
        exo: makeSection(
          'Wallet:1',
          M.interface('Wallet:1', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 42 },
        ),
        metadata: constant({ region: 'us', cost: 1 }),
      },
    ];

    const wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      lift: spy,
    });
    await E(wallet).getBalance('alice');

    expect(capturedContext).toStrictEqual({
      method: 'getBalance',
      args: ['alice'],
      constraints: { region: 'us' },
    });
    expect(capturedGerms.map((germ) => germ.metadata)).toStrictEqual([
      { cost: 100 },
      { cost: 1 },
    ]);
  });

  it('all-shared metadata yields empty distinguishing metadata', async () => {
    type Meta = { region: string };
    let capturedGerms: EvaluatedSection<Partial<Meta>>[] = [];
    let capturedContext: LiftContext<Meta> | undefined;

    const spy: Lift<Meta> = async function* (germs, context) {
      capturedGerms = germs;
      capturedContext = context;
      yield germs[0]!;
    };

    const sections: PresheafSection<Meta>[] = [
      {
        exo: makeSection(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 100 },
        ),
        metadata: constant({ region: 'us' }),
      },
      {
        exo: makeSection(
          'Wallet:1',
          M.interface('Wallet:1', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 42 },
        ),
        metadata: constant({ region: 'us' }),
      },
    ];

    const wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      lift: spy,
    });
    await E(wallet).getBalance('alice');

    // Both sections collapsed to one germ → lift not invoked
    expect(capturedContext).toBeUndefined();
    expect(capturedGerms).toHaveLength(0);
  });

  it('collapses equivalent presheaf sections by metadata', async () => {
    type Meta = { cost: number };
    let liftCalled = false;

    const sections: PresheafSection<Meta>[] = [
      {
        exo: makeSection(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 100 },
        ),
        metadata: constant({ cost: 1 }),
      },
      {
        exo: makeSection(
          'Wallet:1',
          M.interface('Wallet:1', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 42 },
        ),
        metadata: constant({ cost: 1 }),
      },
    ];

    const wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      // eslint-disable-next-line require-yield
      async *lift(_germs) {
        liftCalled = true;
      },
    });
    await E(wallet).getBalance('alice');

    // Both sections have identical metadata → collapsed to one germ → lift bypassed
    expect(liftCalled).toBe(false);
  });

  it('collapses no-metadata and empty-object metadata as equivalent', async () => {
    type Meta = Record<string, never>;
    let liftCalled = false;

    const sections: PresheafSection<Meta>[] = [
      {
        exo: makeSection(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 100 },
        ),
      },
      {
        exo: makeSection(
          'Wallet:1',
          M.interface('Wallet:1', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 42 },
        ),
        metadata: constant({}),
      },
    ];

    const wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      // eslint-disable-next-line require-yield
      async *lift(_germs) {
        liftCalled = true;
      },
    });
    await E(wallet).getBalance('alice');

    expect(liftCalled).toBe(false);
  });

  it('mixed sections participate in lift', async () => {
    const argmin: Lift<{ cost: number }> = async function* (germs) {
      yield* [...germs].sort(
        (a, b) =>
          (a.metadata?.cost ?? Infinity) - (b.metadata?.cost ?? Infinity),
      );
    };

    const exo = makeSection(
      'cheap',
      M.interface('cheap', {
        getBalance: M.call(M.string()).returns(M.number()),
      }),
      { getBalance: (_acct: string) => 42 },
    );
    const sections: PresheafSection<{ cost: number }>[] = [
      {
        exo: makeSection(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 100 },
        ),
        metadata: constant({ cost: 100 }),
      },
      { exo, metadata: constant({ cost: 1 }) },
    ];

    const wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
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
    const sections: PresheafSection<Record<string, never>>[] = [
      {
        exo: makeSection(
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
      sections,
    }).getDiscoverableGlobalSection({
      async *lift(germs) {
        yield germs[0]!;
      },
      schema,
    });

    expect(E(section)[GET_DESCRIPTION]()).toStrictEqual(schema);
  });

  it('getSection does not expose __getDescription__', () => {
    const sections: PresheafSection<Record<string, never>>[] = [
      {
        exo: makeSection(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 42 },
        ),
      },
    ];

    const section = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      async *lift(germs) {
        yield germs[0]!;
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
    const sections: PresheafSection<Record<string, never>>[] = [
      {
        exo: makeSection(
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

    const section = sheafify({ name: 'Wallet', sections }).getSection({
      guard: readGuard,
      async *lift(germs) {
        yield germs[0]!;
      },
    });

    expect(await E(section).getBalance('alice')).toBe(42);
  });

  it('rejects method calls outside the explicit guard', async () => {
    const sections: PresheafSection<Record<string, never>>[] = [
      {
        exo: makeSection(
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

    const section = sheafify({ name: 'Wallet', sections }).getSection({
      guard: readGuard,
      async *lift(germs) {
        yield germs[0]!;
      },
    });

    // makeExo only places methods from the guard on the object — transfer is absent
    expect((section as Record<string, unknown>).transfer).toBeUndefined();
  });

  it('getDiscoverableSection exposes __getDescription__ and obeys explicit guard', async () => {
    const sections: PresheafSection<Record<string, never>>[] = [
      {
        exo: makeSection(
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
      sections,
    }).getDiscoverableSection({
      guard: readGuard,
      async *lift(germs) {
        yield germs[0]!;
      },
      schema,
    });

    expect(E(section)[GET_DESCRIPTION]()).toStrictEqual(schema);
    expect(await E(section).getBalance('alice')).toBe(42);
  });
});
