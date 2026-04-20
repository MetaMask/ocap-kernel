/**
 * Matcher vat: implements the `ServiceMatcher` interface from
 * `@metamask/service-discovery-types`.
 *
 * On bootstrap it issues an OCAP URL for its `ServiceMatcher` facet and
 * returns the URL as the bootstrap result. Providers redeem that URL and
 * call one of the `register*` methods. For every registration, the matcher
 * verifies legitimacy by calling `confirmServiceRegistration(token)` on the
 * provider's contact endpoint.
 *
 * Phase 2 implements a naive `findServices` that simply returns every
 * registered description. LLM-driven ranking is a planned follow-on.
 */

import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type {
  Baggage,
  OcapURLIssuerService,
  OcapURLRedemptionService,
} from '@metamask/ocap-kernel';
import type {
  ContactPoint,
  RegistrationToken,
  ServiceDescription,
  ServiceMatch,
  ServiceQuery,
} from '@metamask/service-discovery-types';

type RegisteredService = {
  id: string;
  description: ServiceDescription;
  contact: ContactPoint;
};

type Services = {
  ocapURLIssuerService: OcapURLIssuerService;
  ocapURLRedemptionService: OcapURLRedemptionService;
};

/**
 * Build the matcher vat's root object.
 *
 * @param _vatPowers - Vat powers (unused).
 * @param _parameters - Parameters passed to the vat (unused).
 * @param _baggage - Vat baggage for durable storage (unused; the matcher
 * registry is in-memory for now).
 * @returns The vat root exo, exposing `bootstrap`, `getPublicFacet`,
 * `listAll`, and `unregister`.
 */
export function buildRootObject(
  _vatPowers: unknown,
  _parameters: Record<string, unknown>,
  _baggage: Baggage,
): ReturnType<typeof makeDefaultExo> {
  const registry = new Map<string, RegisteredService>();
  let nextId = 0;
  let services: Services;

  /**
   * Validate the registration token with the provider's contact endpoint.
   *
   * @param contact - The provider's contact endpoint.
   * @param token - The token presented by the registrant.
   */
  async function confirmRegistration(
    contact: ContactPoint,
    token: RegistrationToken,
  ): Promise<void> {
    await E(contact).confirmServiceRegistration(token);
  }

  /**
   * Store a service in the registry.
   *
   * @param description - The service description.
   * @param contact - The contact endpoint.
   * @returns The assigned registry id.
   */
  function store(
    description: ServiceDescription,
    contact: ContactPoint,
  ): string {
    const id = `svc:${nextId}`;
    nextId += 1;
    registry.set(id, { id, description, contact });
    return id;
  }

  const publicFacet = makeDefaultExo('ServiceMatcher', {
    async registerService(
      description: ServiceDescription,
      registrationToken: RegistrationToken,
    ): Promise<void> {
      // Use the first contact URL to reach the provider and verify the token.
      const firstContact = description.contact[0];
      if (!firstContact) {
        throw new Error(
          'registerService: ServiceDescription has no contact info',
        );
      }
      const { contactUrl } = firstContact;
      const contact = (await E(services.ocapURLRedemptionService).redeem(
        contactUrl,
      )) as ContactPoint;
      await confirmRegistration(contact, registrationToken);
      store(description, contact);
    },

    async registerServiceByUrl(
      contactUrl: string,
      registrationToken: RegistrationToken,
    ): Promise<void> {
      const contact = (await E(services.ocapURLRedemptionService).redeem(
        contactUrl,
      )) as ContactPoint;
      // Confirm FIRST: an attacker could flood us with registration
      // requests that point at legitimate URLs; doing anything else with
      // the contact before verifying the token would amplify that into
      // work the matcher performs on the victim's behalf.
      await confirmRegistration(contact, registrationToken);
      const description = await E(contact).getServiceDescription();
      store(description, contact);
    },

    async registerServiceByRef(
      contact: ContactPoint,
      registrationToken: RegistrationToken,
    ): Promise<void> {
      // Confirm FIRST — see comment above in registerServiceByUrl.
      await confirmRegistration(contact, registrationToken);
      const description = await E(contact).getServiceDescription();
      store(description, contact);
    },

    async findServices(_query: ServiceQuery): Promise<ServiceMatch[]> {
      // Phase 2: naive — return every registered description, unranked.
      // Ranking will be added in a follow-on once an LLM backend is wired
      // up. The query argument is accepted and ignored for now so the
      // wire protocol is stable.
      return [...registry.values()].map((entry) =>
        harden({ description: entry.description }),
      );
    },
  });

  return makeDefaultExo('matcherVatRoot', {
    async bootstrap(_vats: Record<string, unknown>, incoming: Services) {
      services = incoming;
      if (!services.ocapURLIssuerService) {
        throw new Error('ocapURLIssuerService is required');
      }
      if (!services.ocapURLRedemptionService) {
        throw new Error('ocapURLRedemptionService is required');
      }
      const matcherUrl = await E(services.ocapURLIssuerService).issue(
        publicFacet,
      );
      return harden({ matcherUrl });
    },

    getPublicFacet() {
      return publicFacet;
    },

    /**
     * Admin-side query: list every registered service's registry id and
     * description. Useful for debugging and for an LLM-driven matcher
     * that wants to see raw registry contents.
     *
     * @returns The registry contents.
     */
    listAll(): { id: string; description: ServiceDescription }[] {
      return [...registry.values()].map((entry) => ({
        id: entry.id,
        description: entry.description,
      }));
    },

    /**
     * Admin-side: remove a service from the registry by id.
     *
     * @param id - The registry id to remove.
     * @returns True if an entry was removed, false if no such id existed.
     */
    unregister(id: string): boolean {
      return registry.delete(id);
    },
  });
}
