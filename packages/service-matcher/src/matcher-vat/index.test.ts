import type {
  ContactPoint,
  ServiceDescription,
} from '@metamask/service-discovery-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildRootObject } from './index.ts';

// The matcher vat's logic uses `E()` internally; under unit test we don't
// need CapTP routing, just identity-like resolution so the mock services
// get called directly.
vi.mock('@endo/eventual-send', () => ({
  E: vi.fn((obj: unknown) => obj),
}));

type Services = {
  ocapURLIssuerService: { issue: (obj: unknown) => Promise<string> };
  ocapURLRedemptionService: { redeem: (url: string) => Promise<unknown> };
};

const sampleDescription = (
  name = 'Signer',
  contactUrl = 'ocap:abc@peer',
): ServiceDescription => ({
  apiSpec: { properties: {} },
  description: `A service called ${name}`,
  contact: [{ contactType: 'public', contactUrl }],
});

/**
 * Build a mocked ContactPoint whose `confirmServiceRegistration` verifies
 * the presented token against `expectedToken`.
 *
 * @param options - Options for the mock contact point.
 * @param options.description - The ServiceDescription to return.
 * @param options.expectedToken - The token the matcher must present.
 * @returns A mock contact point plus access to the mock fns.
 */
function makeMockContact(options: {
  description: ServiceDescription;
  expectedToken: string;
}) {
  const { description, expectedToken } = options;
  const getServiceDescription = vi.fn(async () => description);
  const confirmServiceRegistration = vi.fn(async (token: string) => {
    if (token !== expectedToken) {
      throw new Error(
        `token mismatch: expected ${expectedToken}, got ${token}`,
      );
    }
  });
  const initiateContact = vi.fn(async () => ({}));
  const contact: ContactPoint = {
    getServiceDescription,
    confirmServiceRegistration,
    initiateContact,
  };
  return { contact, getServiceDescription, confirmServiceRegistration };
}

/**
 * Build a default services bag whose `issue` returns a deterministic URL
 * and whose `redeem` resolves a preconfigured contact (set via `setRedeem`).
 *
 * @returns The services bag plus helpers to inspect calls.
 */
function makeMockServices() {
  const issue = vi.fn(async (_obj: unknown) => 'ocap:matcher-url@peer');
  let redeemResult: unknown = null;
  const redeem = vi.fn(async (_url: string) => redeemResult);
  const services: Services = {
    ocapURLIssuerService: { issue },
    ocapURLRedemptionService: { redeem },
  };
  return {
    services,
    issue,
    redeem,
    setRedeem: (value: unknown) => {
      redeemResult = value;
    },
  };
}

describe('matcher vat', () => {
  let root: ReturnType<typeof buildRootObject>;
  let mocks: ReturnType<typeof makeMockServices>;

  beforeEach(async () => {
    root = buildRootObject({}, {}, {} as never);
    mocks = makeMockServices();
  });

  describe('bootstrap', () => {
    it('issues an ocap URL for the public facet and returns it', async () => {
      const result = await root.bootstrap({}, mocks.services);
      expect(result).toStrictEqual({ matcherUrl: 'ocap:matcher-url@peer' });
      expect(mocks.issue).toHaveBeenCalledTimes(1);
    });

    it('throws if ocapURLIssuerService is missing', async () => {
      await expect(
        root.bootstrap({}, {
          ocapURLRedemptionService: mocks.services.ocapURLRedemptionService,
        } as Services),
      ).rejects.toThrow('ocapURLIssuerService is required');
    });

    it('throws if ocapURLRedemptionService is missing', async () => {
      await expect(
        root.bootstrap({}, {
          ocapURLIssuerService: mocks.services.ocapURLIssuerService,
        } as Services),
      ).rejects.toThrow('ocapURLRedemptionService is required');
    });
  });

  describe('registerServiceByRef', () => {
    it('confirms the token, stores the service, and surfaces it via listAll/findServices', async () => {
      await root.bootstrap({}, mocks.services);
      const publicFacet = root.getPublicFacet();
      const description = sampleDescription('Foo');
      const { contact, confirmServiceRegistration, getServiceDescription } =
        makeMockContact({ description, expectedToken: 'tok-1' });

      await publicFacet.registerServiceByRef(contact, 'tok-1');

      expect(getServiceDescription).toHaveBeenCalledTimes(1);
      expect(confirmServiceRegistration).toHaveBeenCalledWith('tok-1');

      const all = root.listAll();
      expect(all).toHaveLength(1);
      expect(all[0]?.description).toStrictEqual(description);

      const matches = await publicFacet.findServices({ description: 'any' });
      expect(matches).toStrictEqual([{ description }]);
    });

    it('rejects when the provider reports a token mismatch', async () => {
      await root.bootstrap({}, mocks.services);
      const publicFacet = root.getPublicFacet();
      const { contact } = makeMockContact({
        description: sampleDescription(),
        expectedToken: 'real-token',
      });

      await expect(
        publicFacet.registerServiceByRef(contact, 'wrong-token'),
      ).rejects.toThrow(/token mismatch/u);
      expect(root.listAll()).toHaveLength(0);
    });

    it('calls confirmServiceRegistration before getServiceDescription', async () => {
      await root.bootstrap({}, mocks.services);
      const publicFacet = root.getPublicFacet();
      const { contact, getServiceDescription, confirmServiceRegistration } =
        makeMockContact({
          description: sampleDescription(),
          expectedToken: 'tok',
        });

      await publicFacet.registerServiceByRef(contact, 'tok');

      const confirmOrder =
        confirmServiceRegistration.mock.invocationCallOrder[0];
      const getOrder = getServiceDescription.mock.invocationCallOrder[0];
      expect(confirmOrder).toBeDefined();
      expect(getOrder).toBeDefined();
      expect(confirmOrder).toBeLessThan(getOrder as number);
    });

    it('does not call getServiceDescription when confirm rejects', async () => {
      await root.bootstrap({}, mocks.services);
      const publicFacet = root.getPublicFacet();
      const { contact, getServiceDescription } = makeMockContact({
        description: sampleDescription(),
        expectedToken: 'real-token',
      });

      await expect(
        publicFacet.registerServiceByRef(contact, 'wrong-token'),
      ).rejects.toThrow(/token mismatch/u);
      expect(getServiceDescription).not.toHaveBeenCalled();
    });
  });

  describe('registerServiceByUrl', () => {
    it('redeems the URL, confirms the token, and stores the service', async () => {
      await root.bootstrap({}, mocks.services);
      const publicFacet = root.getPublicFacet();
      const description = sampleDescription('Bar', 'ocap:bar@peer');
      const { contact, confirmServiceRegistration } = makeMockContact({
        description,
        expectedToken: 'tok-2',
      });
      mocks.setRedeem(contact);

      await publicFacet.registerServiceByUrl('ocap:bar@peer', 'tok-2');

      expect(mocks.redeem).toHaveBeenCalledWith('ocap:bar@peer');
      expect(confirmServiceRegistration).toHaveBeenCalledWith('tok-2');
      expect(root.listAll()).toHaveLength(1);
    });

    it('does not call getServiceDescription when confirm rejects', async () => {
      await root.bootstrap({}, mocks.services);
      const publicFacet = root.getPublicFacet();
      const { contact, getServiceDescription } = makeMockContact({
        description: sampleDescription('Bar', 'ocap:bar@peer'),
        expectedToken: 'right',
      });
      mocks.setRedeem(contact);

      await expect(
        publicFacet.registerServiceByUrl('ocap:bar@peer', 'wrong'),
      ).rejects.toThrow(/token mismatch/u);
      expect(getServiceDescription).not.toHaveBeenCalled();
      expect(root.listAll()).toHaveLength(0);
    });
  });

  describe('registerService', () => {
    it('redeems the first contact URL from the description and confirms the token', async () => {
      await root.bootstrap({}, mocks.services);
      const publicFacet = root.getPublicFacet();
      const description = sampleDescription('Baz', 'ocap:baz@peer');
      const { contact, confirmServiceRegistration } = makeMockContact({
        description,
        expectedToken: 'tok-3',
      });
      mocks.setRedeem(contact);

      await publicFacet.registerService(description, 'tok-3');

      expect(mocks.redeem).toHaveBeenCalledWith('ocap:baz@peer');
      expect(confirmServiceRegistration).toHaveBeenCalledWith('tok-3');
      expect(root.listAll()).toHaveLength(1);
    });

    it('throws when the description has no contact info', async () => {
      await root.bootstrap({}, mocks.services);
      const publicFacet = root.getPublicFacet();
      const description: ServiceDescription = {
        apiSpec: { properties: {} },
        description: 'no contact',
        contact: [],
      };

      await expect(
        publicFacet.registerService(description, 'tok'),
      ).rejects.toThrow(/no contact info/u);
    });
  });

  describe('findServices', () => {
    it('returns an empty list when nothing is registered', async () => {
      await root.bootstrap({}, mocks.services);
      const publicFacet = root.getPublicFacet();
      const matches = await publicFacet.findServices({ description: 'x' });
      expect(matches).toStrictEqual([]);
    });

    it('returns every registered service regardless of the query (Phase 2 behavior)', async () => {
      await root.bootstrap({}, mocks.services);
      const publicFacet = root.getPublicFacet();
      const descA = sampleDescription('A', 'ocap:a@p');
      const descB = sampleDescription('B', 'ocap:b@p');
      const { contact: cA } = makeMockContact({
        description: descA,
        expectedToken: 'a',
      });
      const { contact: cB } = makeMockContact({
        description: descB,
        expectedToken: 'b',
      });
      await publicFacet.registerServiceByRef(cA, 'a');
      await publicFacet.registerServiceByRef(cB, 'b');

      const matches = await publicFacet.findServices({
        description: 'anything',
      });
      expect(
        matches.map((entry) => entry.description.description),
      ).toStrictEqual([descA.description, descB.description]);
    });
  });

  describe('unregister', () => {
    it('removes a registered service by id', async () => {
      await root.bootstrap({}, mocks.services);
      const publicFacet = root.getPublicFacet();
      const { contact } = makeMockContact({
        description: sampleDescription(),
        expectedToken: 't',
      });
      await publicFacet.registerServiceByRef(contact, 't');
      const [entry] = root.listAll();
      expect(entry).toBeDefined();

      const removed = root.unregister(entry?.id ?? '');
      expect(removed).toBe(true);
      expect(root.listAll()).toHaveLength(0);
    });

    it('returns false when the id is unknown', async () => {
      await root.bootstrap({}, mocks.services);
      expect(root.unregister('svc:999')).toBe(false);
    });
  });
});
