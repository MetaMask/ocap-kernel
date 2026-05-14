/**
 * Matcher vat: implements the `ServiceMatcher` interface from
 * `@metamask/service-discovery-types`.
 *
 * The matcher's public facet is a **durable** singleton: its kref is
 * stored in baggage via `defineDurableKind` so that on vat
 * re-incarnation (e.g., daemon restart with `--keep-state`) the same
 * kref is restored. Because the kernel's peer ID and OCAP-URL
 * encryption key also persist, the matcher's OCAP URL is stable
 * across daemon restarts.
 *
 * The registry of registered services, on the other hand, is
 * **in-memory**. After a matcher restart, providers must re-register.
 * Making the registry durable is a planned follow-up — see the
 * "dedup / liveness" entry in `discovery-plan.md` for the design
 * obligations that come with that path.
 *
 * `findServices` is a naive "return all entries" implementation;
 * LLM-driven ranking is a planned follow-on.
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
 * Vat-data primitives we need from the `vatPowers` argument. Provided by
 * swingset-liveslots; see liveslots.js → vatGlobals.VatData.
 */
type VatData = {
  makeKindHandle: (tag: string) => unknown;
  defineDurableKind: <Init extends (...args: never[]) => unknown, Behavior>(
    kindHandle: unknown,
    init: Init,
    behavior: Behavior,
  ) => (...args: Parameters<Init>) => unknown;
};

type VatPowers = {
  VatData: VatData;
};

/**
 * Build the matcher vat's root object.
 *
 * @param vatPowers - Vat powers; `VatData` is required for the durable
 * publicFacet.
 * @param _parameters - Parameters passed to the vat (unused).
 * @param baggage - Vat baggage. The matcher uses it to make the
 * publicFacet's kref durable, and to remember (across restarts) the
 * services bag and the issued matcher URL.
 * @returns The vat root exo, exposing `bootstrap`, `getPublicFacet`,
 * `getMatcherUrl`, `listAll`, and `unregister`.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function buildRootObject(
  vatPowers: VatPowers,
  _parameters: Record<string, unknown>,
  baggage: Baggage,
) {
  const { VatData } = vatPowers;
  if (!VatData?.defineDurableKind || !VatData.makeKindHandle) {
    throw new Error(
      'matcher vat: vatPowers.VatData.{defineDurableKind,makeKindHandle} required',
    );
  }

  // Registry is in-memory. On matcher restart it starts empty;
  // providers must re-register. (See plan follow-up "dedup / liveness".)
  const registry = new Map<string, RegisteredService>();

  const log = (...args: unknown[]): void => {
    // Forwarded to the daemon's log file via the kernel's console
    // plumbing. Prefix tags the source so it's easy to grep.
    // eslint-disable-next-line no-console
    console.log('[matcher]', ...args);
  };

  /**
   * Provide-or-create a baggage entry: read it if it exists, otherwise
   * compute it via `make`, store it, and return.
   *
   * @param key - Baggage key.
   * @param make - Creator invoked only on first call.
   * @returns The stored value.
   */
  function provide<Type>(key: string, make: () => Type): Type {
    if (baggage.has(key)) {
      return baggage.get(key) as Type;
    }
    const value = make();
    baggage.init(key, value);
    return value;
  }

  // ---------------------------------------------------------------------
  // Durable publicFacet kind
  //
  // The kind handle and the singleton instance both live in baggage, so
  // re-incarnation restores the same kref. Behavior methods reference
  // closure-captured `registry` (in-memory) and `getServices()` (durable
  // via baggage); on re-incarnation, this `buildRootObject` runs again,
  // re-defines the kind with a fresh closure, and the singleton's methods
  // are rebound by liveslots to that fresh behavior.
  // ---------------------------------------------------------------------

  const matcherKindHandle = provide('matcherKindHandle', () =>
    VatData.makeKindHandle('ServiceMatcher'),
  );

  /**
   * Look up the services bag in baggage. Bootstrap stores it on first
   * launch; subsequent calls (including after re-incarnation) read from
   * baggage. Throws if bootstrap has not yet run.
   *
   * @returns The kernel-services bag.
   */
  function getServices(): Services {
    if (!baggage.has('services')) {
      throw new Error(
        'matcher vat: services not yet recorded; bootstrap must run first',
      );
    }
    return baggage.get('services') as Services;
  }

  /**
   * Allocate the next registry id, persisting the counter to baggage so
   * ids don't collide across re-incarnations even though the registry
   * map itself is reset.
   *
   * @returns The new id string.
   */
  function nextId(): string {
    const value = baggage.has('nextId') ? (baggage.get('nextId') as number) : 0;
    baggage.has('nextId')
      ? baggage.set('nextId', value + 1)
      : baggage.init('nextId', value + 1);
    return `svc:${value}`;
  }

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
    try {
      await E(contact).confirmServiceRegistration(token);
    } catch (cause) {
      log('registration rejected by contact:', cause);
      throw cause;
    }
  }

  /**
   * Store a service in the (in-memory) registry.
   *
   * @param description - The service description.
   * @param contact - The contact endpoint.
   * @returns The assigned registry id.
   */
  function store(
    description: ServiceDescription,
    contact: ContactPoint,
  ): string {
    const id = nextId();
    registry.set(id, { id, description, contact });
    log(`registered ${id}: ${description.description.slice(0, 80)}`);
    return id;
  }

  const matcherBehavior = {
    async registerService(
      description: ServiceDescription,
      registrationToken: RegistrationToken,
    ): Promise<void> {
      const firstContact = description.contact[0];
      if (!firstContact) {
        throw new Error(
          'registerService: ServiceDescription has no contact info',
        );
      }
      const { contactUrl } = firstContact;
      const contact = (await E(getServices().ocapURLRedemptionService).redeem(
        contactUrl,
      )) as ContactPoint;
      await confirmRegistration(contact, registrationToken);
      store(description, contact);
    },

    async registerServiceByUrl(
      contactUrl: string,
      registrationToken: RegistrationToken,
    ): Promise<void> {
      const contact = (await E(getServices().ocapURLRedemptionService).redeem(
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

    async findServices(query: ServiceQuery): Promise<ServiceMatch[]> {
      const matches = [...registry.values()].map((entry) =>
        harden({ description: entry.description }),
      );
      log(
        `findServices("${query.description.slice(0, 80)}") → ${matches.length} match(es)`,
      );
      return matches;
    },
  };

  // Re-define the durable kind on every incarnation so liveslots can
  // rebind its behavior. The init function is empty: the singleton's
  // per-instance state lives in closure-captured baggage helpers above.
  const makeMatcherFacet = VatData.defineDurableKind(
    matcherKindHandle,
    () => harden({}),
    matcherBehavior,
  );

  // Provide-or-create the singleton publicFacet. On first incarnation
  // this allocates a fresh kref and stores it in baggage. On
  // re-incarnation, the stored ref is rehydrated to the same kref.
  const publicFacet = provide('publicFacet', () =>
    makeMatcherFacet(),
  ) as ContactPoint;

  return makeDefaultExo('matcherVatRoot', {
    async bootstrap(_vats: Record<string, unknown>, incoming: Services) {
      if (!incoming?.ocapURLIssuerService) {
        throw new Error('ocapURLIssuerService is required');
      }
      if (!incoming.ocapURLRedemptionService) {
        throw new Error('ocapURLRedemptionService is required');
      }
      // Persist services so the durable matcher facet's behavior can
      // reach them after re-incarnation (when bootstrap is not re-run).
      if (baggage.has('services')) {
        baggage.set('services', incoming);
      } else {
        baggage.init('services', incoming);
      }
      const matcherUrl = await E(incoming.ocapURLIssuerService).issue(
        publicFacet,
      );
      // Stash the issued URL too. Useful for the "list-subclusters"
      // / "current-matcher-URL" workflow without having to re-issue.
      if (baggage.has('matcherUrl')) {
        baggage.set('matcherUrl', matcherUrl);
      } else {
        baggage.init('matcherUrl', matcherUrl);
      }
      log(`bootstrap complete; matcherUrl=${matcherUrl}`);
      return harden({ matcherUrl });
    },

    getPublicFacet() {
      return publicFacet;
    },

    /**
     * Return the matcher's OCAP URL as previously issued by the
     * `ocapURLIssuerService` during bootstrap. Stable across vat
     * re-incarnations (the URL itself is deterministic given the durable
     * kref + persisted kernel identity, and we cache the issued value in
     * baggage).
     *
     * @returns The matcher OCAP URL, or `undefined` if bootstrap has not
     * yet run.
     */
    getMatcherUrl(): string | undefined {
      return baggage.has('matcherUrl')
        ? (baggage.get('matcherUrl') as string)
        : undefined;
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
      const removed = registry.delete(id);
      if (removed) {
        log(`unregistered ${id}`);
      }
      return removed;
    },
  });
}
