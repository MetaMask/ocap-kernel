import { makeExo, GET_INTERFACE_GUARD } from '@endo/exo';
import { M, getInterfaceGuardPayload } from '@endo/patterns';
import { describe, it, expect } from 'vitest';

import { sheafify } from './sheafify.ts';
import type { Lift, LiftContext, PresheafSection, Section } from './types.ts';

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
    const lift: Lift<{ cost: number }> = async (_germs) => {
      liftCalled = true;
      return Promise.resolve(0);
    };

    const sections: PresheafSection<{ cost: number }>[] = [
      {
        exo: makeExo(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 42 },
        ) as unknown as Section,
        metadata: { cost: 1 },
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
        exo: makeExo(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.eq('alice')).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 42 },
        ) as unknown as Section,
        metadata: { cost: 1 },
      },
    ];

    const wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      lift: async (_germs) => Promise.resolve(0),
    });
    await expect(E(wallet).getBalance('bob')).rejects.toThrow(
      'No section covers',
    );
  });

  it('lift receives metadata and picks winner', async () => {
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
        exo: makeExo(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 100 },
        ) as unknown as Section,
        metadata: { cost: 100 },
      },
      {
        exo: makeExo(
          'Wallet:1',
          M.interface('Wallet:1', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 42 },
        ) as unknown as Section,
        metadata: { cost: 1 },
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
        exo: makeExo(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.eq('alice')).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 100 },
        ) as unknown as Section,
        metadata: { cost: 100 },
      },
      {
        exo: makeExo(
          'Wallet:1',
          M.interface('Wallet:1', {
            getBalance: M.call(M.eq('bob')).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 50 },
        ) as unknown as Section,
        metadata: { cost: 1 },
      },
    ];

    const wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      lift: async (_germs) => Promise.resolve(0),
    });
    const guard = wallet[GET_INTERFACE_GUARD]();
    expect(guard).toBeDefined();

    const { methodGuards } = getInterfaceGuardPayload(guard);
    expect(methodGuards).toHaveProperty('getBalance');
  });

  it('re-sheafification picks up new sections and methods', async () => {
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
        exo: makeExo(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 100 },
        ) as unknown as Section,
        metadata: { cost: 100 },
      },
    ];

    let wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      lift: argmin,
    });
    expect(await E(wallet).getBalance('alice')).toBe(100);

    // Add a cheaper section with a new method to the sections array, re-sheafify.
    sections.push({
      exo: makeExo(
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
      ) as unknown as Section,
      metadata: { cost: 1 },
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
    const exo = makeExo(
      'bal',
      M.interface('bal', {
        getBalance: M.call(M.string()).returns(M.number()),
      }),
      { getBalance: (_acct: string) => 42 },
    );
    const sections: PresheafSection<{ cost: number }>[] = [
      { exo: exo as unknown as Section, metadata: { cost: 1 } },
    ];

    const wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      lift: async (_germs) => Promise.resolve(0),
    });
    expect(await E(wallet).getBalance('alice')).toBe(42);
  });

  it('re-sheafification with pre-built exo picks up new methods', async () => {
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
        exo: makeExo(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 100 },
        ) as unknown as Section,
        metadata: { cost: 100 },
      },
    ];

    let wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      lift: argmin,
    });
    expect(await E(wallet).getBalance('alice')).toBe(100);

    // Add a pre-built exo with a cheaper getBalance + new transfer method
    const exo = makeExo(
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
    sections.push({ exo: exo as unknown as Section, metadata: { cost: 1 } });
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
    const exo = makeExo(
      'bal',
      M.interface('bal', {
        getBalance: M.call(M.string()).returns(M.number()),
      }),
      { getBalance: (_acct: string) => 42 },
    );
    const sections: PresheafSection<{ cost: number }>[] = [
      { exo: exo as unknown as Section, metadata: { cost: 1 } },
    ];

    const wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      lift: async (_germs) => Promise.resolve(0),
    });
    const guard = wallet[GET_INTERFACE_GUARD]();
    expect(guard).toBeDefined();

    const { methodGuards } = getInterfaceGuardPayload(guard);
    expect(methodGuards).toHaveProperty('getBalance');
  });

  it('lift receives constraints in context and only distinguishing metadata', async () => {
    type Meta = { region: string; cost: number };
    let capturedGerms: PresheafSection<Partial<Meta>>[] = [];
    let capturedContext: LiftContext<Meta> | undefined;

    const spy: Lift<Meta> = async (germs, context) => {
      capturedGerms = germs;
      capturedContext = context;
      return Promise.resolve(0);
    };

    const sections: PresheafSection<Meta>[] = [
      {
        exo: makeExo(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 100 },
        ) as unknown as Section,
        metadata: { region: 'us', cost: 100 },
      },
      {
        exo: makeExo(
          'Wallet:1',
          M.interface('Wallet:1', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 42 },
        ) as unknown as Section,
        metadata: { region: 'us', cost: 1 },
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
    let capturedGerms: PresheafSection<Partial<Meta>>[] = [];
    let capturedContext: LiftContext<Meta> | undefined;

    const spy: Lift<Meta> = async (germs, context) => {
      capturedGerms = germs;
      capturedContext = context;
      return Promise.resolve(0);
    };

    const sections: PresheafSection<Meta>[] = [
      {
        exo: makeExo(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 100 },
        ) as unknown as Section,
        metadata: { region: 'us' },
      },
      {
        exo: makeExo(
          'Wallet:1',
          M.interface('Wallet:1', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 42 },
        ) as unknown as Section,
        metadata: { region: 'us' },
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
        exo: makeExo(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 100 },
        ) as unknown as Section,
        metadata: { cost: 1 },
      },
      {
        exo: makeExo(
          'Wallet:1',
          M.interface('Wallet:1', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 42 },
        ) as unknown as Section,
        metadata: { cost: 1 },
      },
    ];

    const wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      lift: async (_germs) => {
        liftCalled = true;
        return Promise.resolve(0);
      },
    });
    await E(wallet).getBalance('alice');

    // Both sections have identical metadata → collapsed to one germ → lift bypassed
    expect(liftCalled).toBe(false);
  });

  it('mixed sections participate in lift', async () => {
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

    const exo = makeExo(
      'cheap',
      M.interface('cheap', {
        getBalance: M.call(M.string()).returns(M.number()),
      }),
      { getBalance: (_acct: string) => 42 },
    );
    const sections: PresheafSection<{ cost: number }>[] = [
      {
        exo: makeExo(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 100 },
        ) as unknown as Section,
        metadata: { cost: 100 },
      },
      { exo: exo as unknown as Section, metadata: { cost: 1 } },
    ];

    const wallet = sheafify({ name: 'Wallet', sections }).getGlobalSection({
      lift: argmin,
    });
    // argmin picks the exo section (cost=1)
    expect(await E(wallet).getBalance('alice')).toBe(42);
  });

  // ---------------------------------------------------------------------------
  // Revocation
  // ---------------------------------------------------------------------------

  it('revokePoint revokes sections covering the point', async () => {
    const sections: PresheafSection<{ cost: number }>[] = [
      {
        exo: makeExo(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 42 },
        ) as unknown as Section,
        metadata: { cost: 1 },
      },
    ];

    const sheaf = sheafify({ name: 'Wallet', sections });
    const wallet = sheaf.getGlobalSection({
      lift: async () => Promise.resolve(0),
    });

    expect(await E(wallet).getBalance('alice')).toBe(42);

    sheaf.revokePoint('getBalance', 'alice');

    // Entire section is revoked, not just the specific point
    await expect(E(wallet).getBalance('alice')).rejects.toThrow(
      'Section revoked',
    );
    await expect(E(wallet).getBalance('bob')).rejects.toThrow(
      'Section revoked',
    );
  });

  it('revokeAll revokes all sections', async () => {
    const sections: PresheafSection<{ cost: number }>[] = [
      {
        exo: makeExo(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 42 },
        ) as unknown as Section,
        metadata: { cost: 1 },
      },
    ];

    const sheaf = sheafify({ name: 'Wallet', sections });
    const wallet = sheaf.getGlobalSection({
      lift: async () => Promise.resolve(0),
    });

    expect(await E(wallet).getBalance('alice')).toBe(42);

    sheaf.revokeAll();

    await expect(E(wallet).getBalance('alice')).rejects.toThrow(
      'Section revoked',
    );
  });

  it('getExported returns union of active section guards', () => {
    const sections: PresheafSection<{ cost: number }>[] = [
      {
        exo: makeExo(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 42 },
        ) as unknown as Section,
        metadata: { cost: 1 },
      },
    ];

    const sheaf = sheafify({ name: 'Wallet', sections });

    // No sections granted yet
    expect(sheaf.getExported()).toBeUndefined();

    sheaf.getGlobalSection({ lift: async () => Promise.resolve(0) });

    const exported = sheaf.getExported();
    expect(exported).toBeDefined();
    const { methodGuards } = getInterfaceGuardPayload(exported!);
    expect(methodGuards).toHaveProperty('getBalance');
  });

  it('getExported excludes revoked sections', () => {
    const sections: PresheafSection<{ cost: number }>[] = [
      {
        exo: makeExo(
          'Wallet:0',
          M.interface('Wallet:0', {
            getBalance: M.call(M.string()).returns(M.number()),
          }),
          { getBalance: (_acct: string) => 42 },
        ) as unknown as Section,
        metadata: { cost: 1 },
      },
    ];

    const sheaf = sheafify({ name: 'Wallet', sections });
    sheaf.getGlobalSection({ lift: async () => Promise.resolve(0) });

    expect(sheaf.getExported()).toBeDefined();

    sheaf.revokeAll();
    expect(sheaf.getExported()).toBeUndefined();
  });
});
