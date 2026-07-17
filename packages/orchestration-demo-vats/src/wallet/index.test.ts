import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildRootObject } from './index.ts';

// Same E() mock as matcher-vat's tests: identity resolution so
// method calls on the mocked services short-circuit to plain
// function calls.
vi.mock('@endo/eventual-send', () => ({
  E: vi.fn((obj: unknown) => obj),
}));

/**
 * Build a fake `Baggage` (swingset-liveslots map store), backed by a
 * plain Map. Same shim shape matcher-vat's tests use.
 *
 * @returns The fake baggage.
 */
function makeFakeBaggage() {
  const store = new Map<string, unknown>();
  return {
    has: (key: string) => store.has(key),
    get: (key: string) => {
      if (!store.has(key)) {
        throw new Error(`baggage: missing key "${key}"`);
      }
      return store.get(key);
    },
    init: (key: string, value: unknown) => {
      if (store.has(key)) {
        throw new Error(`baggage: key "${key}" already initialized`);
      }
      store.set(key, value);
    },
    set: (key: string, value: unknown) => {
      if (!store.has(key)) {
        throw new Error(`baggage: cannot set uninitialized key "${key}"`);
      }
      store.set(key, value);
    },
  };
}

/**
 * Build a minimal fake `Services` object with an ocap URL issuer
 * that returns a deterministic string, plus a redemption service
 * stub that we don't exercise here (bootstrap only calls `issue`).
 *
 * @returns The fake services.
 */
function makeFakeServices() {
  const issue = vi.fn().mockResolvedValue('ocap:wallet-url@peer');
  return {
    services: {
      ocapURLIssuerService: { issue },
      ocapURLRedemptionService: { redeem: vi.fn() },
    },
    issue,
  };
}

describe('wallet vat', () => {
  let root: ReturnType<typeof buildRootObject>;

  beforeEach(async () => {
    root = buildRootObject({}, {}, makeFakeBaggage() as never);
    await root.bootstrap({}, makeFakeServices().services);
  });

  describe('bootstrap', () => {
    it('issues an OCAP URL and caches it in baggage', async () => {
      const baggage = makeFakeBaggage();
      const freshRoot = buildRootObject({}, {}, baggage as never);
      const { services, issue } = makeFakeServices();
      const result = await freshRoot.bootstrap({}, services);
      expect(result).toStrictEqual({ walletUrl: 'ocap:wallet-url@peer' });
      expect(issue).toHaveBeenCalledTimes(1);
      expect(freshRoot.getWalletUrl()).toBe('ocap:wallet-url@peer');
    });

    it('throws if ocapURLIssuerService is missing', async () => {
      const freshRoot = buildRootObject({}, {}, makeFakeBaggage() as never);
      await expect(
        freshRoot.bootstrap({}, {
          ocapURLRedemptionService: { redeem: vi.fn() },
        } as never),
      ).rejects.toThrow('ocapURLIssuerService is required');
    });

    it('throws if ocapURLRedemptionService is missing', async () => {
      const freshRoot = buildRootObject({}, {}, makeFakeBaggage() as never);
      await expect(
        freshRoot.bootstrap({}, {
          ocapURLIssuerService: { issue: vi.fn().mockResolvedValue('x') },
        } as never),
      ).rejects.toThrow('ocapURLRedemptionService is required');
    });
  });

  describe('balance', () => {
    it('starts at the default initial balance ($10,000)', () => {
      expect(root.getPublicFacet().balance()).toBe(1_000_000);
    });
  });

  describe('deposit', () => {
    it('adds to the balance and returns the new value', () => {
      const facet = root.getPublicFacet();
      const newBalance = facet.deposit(50_000);
      expect(newBalance).toBe(1_050_000);
      expect(facet.balance()).toBe(1_050_000);
    });

    it('rejects a negative amount', () => {
      expect(() => root.getPublicFacet().deposit(-1)).toThrow(
        /non-negative integer/u,
      );
    });

    it('rejects a non-integer amount', () => {
      expect(() => root.getPublicFacet().deposit(12.5)).toThrow(
        /non-negative integer/u,
      );
    });

    it('accepts zero (no-op)', () => {
      const facet = root.getPublicFacet();
      expect(facet.deposit(0)).toBe(1_000_000);
    });
  });

  describe('withdraw', () => {
    it('subtracts from the balance and returns a Money + new balance', async () => {
      const facet = root.getPublicFacet();
      const [money, newBalance] = await facet.withdraw(40_000);
      expect(money.amount).toBe(40_000);
      expect(typeof money.auth).toBe('string');
      // Auth is `<nonce>.<mac>`; both parts hex, non-empty.
      expect(money.auth).toMatch(/^[0-9a-f]+\.[0-9a-f]+$/u);
      expect(newBalance).toBe(960_000);
      expect(facet.balance()).toBe(960_000);
    });

    it('produces distinct auth nonces on successive calls', async () => {
      const facet = root.getPublicFacet();
      const [m1] = await facet.withdraw(1000);
      const [m2] = await facet.withdraw(1000);
      expect(m1.auth).not.toBe(m2.auth);
    });

    it('rejects zero-amount withdrawals', async () => {
      await expect(root.getPublicFacet().withdraw(0)).rejects.toThrow(
        /positive/u,
      );
    });

    it('rejects negative amounts', async () => {
      await expect(root.getPublicFacet().withdraw(-5)).rejects.toThrow(
        /non-negative integer/u,
      );
    });

    it('rejects non-integer amounts', async () => {
      await expect(root.getPublicFacet().withdraw(1.5)).rejects.toThrow(
        /non-negative integer/u,
      );
    });

    it('refuses to overdraw', async () => {
      const facet = root.getPublicFacet();
      await expect(facet.withdraw(2_000_000)).rejects.toThrow(/overdraw/u);
      // Balance is unchanged after a refused overdraw.
      expect(facet.balance()).toBe(1_000_000);
    });
  });

  describe('init', () => {
    it('resets the balance to the given value', async () => {
      const facet = root.getPublicFacet();
      await facet.withdraw(500_000);
      expect(facet.balance()).toBe(500_000);
      facet.init(2_000_000);
      expect(facet.balance()).toBe(2_000_000);
    });

    it('accepts zero (empty wallet)', () => {
      const facet = root.getPublicFacet();
      facet.init(0);
      expect(facet.balance()).toBe(0);
    });

    it('rejects negative amounts', () => {
      expect(() => root.getPublicFacet().init(-1)).toThrow(
        /non-negative integer/u,
      );
    });

    it('rejects non-integer amounts', () => {
      expect(() => root.getPublicFacet().init(1.5)).toThrow(
        /non-negative integer/u,
      );
    });
  });

  describe('persistence across re-incarnation', () => {
    it('restores the balance from baggage', async () => {
      const sharedBaggage = makeFakeBaggage();
      const firstRoot = buildRootObject({}, {}, sharedBaggage as never);
      await firstRoot.bootstrap({}, makeFakeServices().services);
      await firstRoot.getPublicFacet().withdraw(250_000);
      expect(firstRoot.getPublicFacet().balance()).toBe(750_000);

      // Simulate re-incarnation: build a fresh root over the same baggage,
      // without bootstrap (which is only called on first launch).
      const secondRoot = buildRootObject({}, {}, sharedBaggage as never);
      expect(secondRoot.getPublicFacet().balance()).toBe(750_000);
    });

    it('preserves the wallet URL across re-incarnation', async () => {
      const sharedBaggage = makeFakeBaggage();
      const firstRoot = buildRootObject({}, {}, sharedBaggage as never);
      await firstRoot.bootstrap({}, makeFakeServices().services);
      const url = firstRoot.getWalletUrl();

      const secondRoot = buildRootObject({}, {}, sharedBaggage as never);
      expect(secondRoot.getWalletUrl()).toBe(url);
    });
  });
});
