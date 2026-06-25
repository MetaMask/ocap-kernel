/**
 * Matcher vat: implements the `ServiceMatcher` interface from
 * `@metamask/service-discovery-types`.
 *
 * The matcher exposes two co-resident facets, both **durable**
 * singletons of a single multi-facet kind defined via
 * `VatData.defineDurableKindMulti`:
 *
 * - **public** — the consumer-facing surface that the matcher OCAP
 *   URL redeems to. Methods: `registerService`,
 *   `registerServiceByUrl`, `registerServiceByRef`, `findServices`.
 * - **observer** — a separate read-only enumeration surface for
 *   operator tooling (the orchestration demo's `demo-display`).
 *   Methods: `listAll`. Reached via its own OCAP URL, returned only
 *   from the vat root's admin-only `getObserverUrl()`.
 *
 * Each facet's kref is stored in baggage so that on vat
 * re-incarnation (e.g., daemon restart with `--keep-state`) the same
 * krefs are restored. Because the kernel's peer ID and OCAP-URL
 * encryption key also persist, both URLs are stable across daemon
 * restarts. Changing the kind shape (e.g., adding or removing
 * facets) requires a cold start: durable-kind machinery will reject
 * a shape change in place.
 *
 * The registry of registered services is durable: each entry is
 * mirrored into baggage under a `registry/<id>` key as it lands,
 * and the in-memory `Map` is restored from baggage on re-incarnation.
 * The LLM bridge's conversation history is separate from baggage,
 * so on the first `findServices` after re-incarnation the matcher
 * re-ingests all restored entries into the bridge before honouring
 * the query — the `bridgeIsCurrent` flag in `buildRootObject`
 * tracks whether that re-sync is still pending. Stale entries
 * (whose providers have gone away) clean up via the existing
 * `(peerId, providerTag)` dedup the next time the same provider
 * re-registers. To wipe the registry deliberately — e.g. before a
 * fresh demo run — call the vat root's `clearRegistry()`.
 *
 * Ranking is delegated to an LLM-backed bridge process via an
 * `IOService` endowment named `llm`. On every successful registration
 * the matcher feeds the LLM a digest of the service (description +
 * method names); on every `findServices` call it asks the LLM to pick
 * matches against the user's natural-language query and replies
 * accordingly. There is no fallback ranker — bridge errors propagate
 * to the caller so problems are visible during development.
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
  ObjectSpec,
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

/**
 * The vat-facing shape of an `IOService`. The kernel-side
 * implementation lives in `packages/ocap-kernel/src/io/io-service.ts`
 * and is wired up via the cluster config's `io` block.
 */
type IOService = {
  read: () => Promise<string | null>;
  write: (data: string) => Promise<void>;
};

type Services = {
  ocapURLIssuerService: OcapURLIssuerService;
  ocapURLRedemptionService: OcapURLRedemptionService;
  llm: IOService;
};

/** Wire-protocol shapes — must agree with `@ocap/llm-bridge`'s `protocol.ts`. */
type IngestRequest = {
  kind: 'ingest';
  service: {
    id: string;
    description: string;
    methods: { name: string; description?: string }[];
  };
};

type QueryRequest = {
  kind: 'query';
  query: string;
};

type IngestedReply = { kind: 'ingested' };
type MatchesReply = {
  kind: 'matches';
  matches: { id: string; rationale: string }[];
};
type ErrorReply = { kind: 'error'; message: string };
type Reply = IngestedReply | MatchesReply | ErrorReply;

/**
 * Vat-data primitives we need from the `vatPowers` argument. Provided
 * by swingset-liveslots; see liveslots.js → vatGlobals.VatData.
 */
type VatData = {
  makeKindHandle: (tag: string) => unknown;
  defineDurableKindMulti: <
    Init extends (...args: never[]) => unknown,
    BehaviorKit extends Record<string, Record<string, unknown>>,
  >(
    kindHandle: unknown,
    init: Init,
    behaviorKit: BehaviorKit,
  ) => (...args: Parameters<Init>) => { [K in keyof BehaviorKit]: unknown };
};

type VatPowers = {
  VatData: VatData;
};

/**
 * Build the matcher vat's root object.
 *
 * @param vatPowers - Vat powers; `VatData` is required for the durable
 * matcher facets.
 * @param _parameters - Parameters passed to the vat (unused).
 * @param baggage - Vat baggage. The matcher uses it to make both
 * facet krefs durable, and to remember (across restarts) the services
 * bag and the issued public and observer URLs.
 * @returns The vat root exo, exposing `bootstrap`, `getPublicFacet`,
 * `getMatcherUrl`, `getObserverUrl`, and `unregister`.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function buildRootObject(
  vatPowers: VatPowers,
  _parameters: Record<string, unknown>,
  baggage: Baggage,
) {
  const { VatData } = vatPowers;
  if (!VatData?.defineDurableKindMulti || !VatData.makeKindHandle) {
    throw new Error(
      'matcher vat: vatPowers.VatData.{defineDurableKindMulti,makeKindHandle} required',
    );
  }

  /** Baggage-key namespace for individual registry entries. */
  const REGISTRY_KEY_PREFIX = 'registry/';

  /**
   * Restore the in-memory registry from baggage on every
   * `buildRootObject` call (which runs at first launch and on each
   * re-incarnation). New entries land in baggage as they're
   * `store()`d; deletions go through `removePersistedEntry()`.
   */
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
  // Durable matcher kind (multi-facet: public + observer)
  //
  // The kind handle and the singleton instance both live in baggage, so
  // re-incarnation restores the same krefs for both facets. Behavior
  // methods reference closure-captured `registry` (in-memory) and
  // `getServices()` (durable via baggage); on re-incarnation, this
  // `buildRootObject` runs again, re-defines the kind with a fresh
  // closure, and the singleton's methods are rebound by liveslots to
  // that fresh behavior.
  //
  // The kind name is unchanged from the single-facet predecessor, so
  // existing daemons carrying old-shape state will fail on restart and
  // must cold-start. `start-matcher.sh` purges state by default.
  // ---------------------------------------------------------------------

  const matcherKindHandle = provide('matcherKindHandle', () =>
    VatData.makeKindHandle('ServiceMatcher'),
  );

  /**
   * Look up the services bag in baggage. Bootstrap stores it on first
   * launch; subsequent calls (including after re-incarnation) read
   * from baggage. Throws if bootstrap has not yet run.
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
   * ids don't collide across re-incarnations.
   *
   * @returns The new id string.
   */
  function nextId(): string {
    const value = baggage.has('nextId') ? (baggage.get('nextId') as number) : 0;
    if (baggage.has('nextId')) {
      baggage.set('nextId', value + 1);
    } else {
      baggage.init('nextId', value + 1);
    }
    return `svc:${value}`;
  }

  /**
   * Mirror a registry entry into baggage. Called after every `store()`
   * and after every successful rollback-restore so the durable view
   * stays in sync with the in-memory `registry` map.
   *
   * @param entry - The registry entry to persist.
   */
  function persistEntry(entry: RegisteredService): void {
    const key = `${REGISTRY_KEY_PREFIX}${entry.id}`;
    if (baggage.has(key)) {
      baggage.set(key, entry);
    } else {
      baggage.init(key, entry);
    }
  }

  /**
   * Drop a registry entry from baggage. Idempotent — safe to call
   * for ids that were never persisted.
   *
   * @param id - The registry id to forget.
   */
  function removePersistedEntry(id: string): void {
    const key = `${REGISTRY_KEY_PREFIX}${id}`;
    if (baggage.has(key)) {
      baggage.delete(key);
    }
  }

  /**
   * Wipe every persisted registry entry from baggage. The in-memory
   * `registry` map is not touched here — callers must clear it
   * themselves; see `clearRegistry()` on the vat root.
   *
   * @returns The number of entries removed.
   */
  function clearAllPersistedEntries(): number {
    const toRemove: string[] = [];
    for (const key of baggage.keys()) {
      if (typeof key === 'string' && key.startsWith(REGISTRY_KEY_PREFIX)) {
        toRemove.push(key);
      }
    }
    for (const key of toRemove) {
      baggage.delete(key);
    }
    return toRemove.length;
  }

  // Restore the in-memory registry from baggage. Runs both at first
  // launch (where the loop iterates 0 entries) and at every
  // re-incarnation (where it repopulates the map from the durable
  // entries committed by prior calls to `persistEntry`).
  for (const key of baggage.keys()) {
    if (typeof key === 'string' && key.startsWith(REGISTRY_KEY_PREFIX)) {
      const id = key.slice(REGISTRY_KEY_PREFIX.length);
      registry.set(id, baggage.get(key) as RegisteredService);
    }
  }
  if (registry.size > 0) {
    log(`restored ${registry.size} registered service(s) from baggage`);
  }

  // Tracks whether the LLM bridge has been told about the entries the
  // matcher currently holds. On every `buildRootObject` (re-incarnation)
  // this starts false if the registry is non-empty; the first
  // `findServices` call after restart triggers a re-ingest of all
  // restored entries before the query proceeds. On an empty registry
  // there's nothing to re-ingest, so the flag starts true.
  let bridgeIsCurrent = registry.size === 0;

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
   * Walk a `ServiceDescription`'s top-level apiSpec, collecting names
   * and (optional) descriptions for any methods exposed by remotables
   * directly in the apiSpec. We don't recurse into nested objects or
   * remotables-of-remotables — keeps the LLM prompt tight.
   *
   * @param apiSpec - The service's API spec object.
   * @returns A list of method digests for the LLM prompt.
   */
  function extractMethodDigests(
    apiSpec: ObjectSpec,
  ): { name: string; description?: string }[] {
    const out: { name: string; description?: string }[] = [];
    for (const value of Object.values(apiSpec.properties)) {
      if (value.type.kind !== 'remotable') {
        continue;
      }
      for (const [name, method] of Object.entries(value.type.spec.methods)) {
        out.push(
          method.description
            ? { name, description: method.description }
            : { name },
        );
      }
    }
    return out;
  }

  // -------------------------------------------------------------------
  // Bridge mutex.
  //
  // The vat may have many register* / findServices calls in flight
  // concurrently. The bridge channel is a single line-stream and the
  // protocol is strictly request-then-reply, so we serialize round-trips
  // through a chained promise to keep replies matched to their requests.
  // -------------------------------------------------------------------

  let bridgeChain: Promise<unknown> = Promise.resolve();

  /**
   * Run `fn` only after the previous bridge round-trip has settled.
   * Errors from the previous holder are swallowed so they don't poison
   * subsequent calls.
   *
   * @param fn - The bridge round-trip to serialize.
   * @returns Whatever `fn` returns.
   */
  async function withBridgeLock<Result>(
    fn: () => Promise<Result>,
  ): Promise<Result> {
    const previous = bridgeChain;
    let release: () => void = () => undefined;
    bridgeChain = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      // Wait for the previous holder to finish; ignore its outcome —
      // an error there shouldn't poison subsequent calls.
      await previous.catch(() => undefined);
      return await fn();
    } finally {
      release();
    }
  }

  /**
   * Send a single request to the bridge over the `llm` IOService and
   * await its single-line reply.
   *
   * @param request - The request object to send (will be JSON-encoded).
   * @returns The parsed reply.
   * @throws If the channel has closed, or the reply isn't valid JSON.
   */
  async function bridgeRoundTrip(
    request: IngestRequest | QueryRequest,
  ): Promise<Reply> {
    return withBridgeLock(async () => {
      const { llm } = getServices();
      // The kernel-side IOChannel appends '\n' itself, so we just send
      // the JSON-encoded request body.
      await E(llm).write(JSON.stringify(request));
      const line = await E(llm).read();
      if (line === null) {
        throw new Error('matcher vat: llm bridge channel closed');
      }
      try {
        return JSON.parse(line) as Reply;
      } catch {
        throw new Error(
          `matcher vat: llm bridge sent unparseable line: ${line}`,
        );
      }
    });
  }

  /**
   * Tell the bridge to ingest a new service registration into its
   * conversation context.
   *
   * @param id - The matcher's local registry id for the service.
   * @param description - The full service description.
   * @throws If the bridge replies with `error` or any non-`ingested` kind.
   */
  async function ingestService(
    id: string,
    description: ServiceDescription,
  ): Promise<void> {
    const request: IngestRequest = {
      kind: 'ingest',
      service: {
        id,
        description: description.description,
        methods: extractMethodDigests(description.apiSpec),
      },
    };
    const reply = await bridgeRoundTrip(request);
    if (reply.kind === 'error') {
      throw new Error(`matcher vat: bridge ingest error: ${reply.message}`);
    }
    if (reply.kind !== 'ingested') {
      throw new Error(
        `matcher vat: unexpected bridge reply kind for ingest: ${reply.kind}`,
      );
    }
  }

  /**
   * Ask the bridge to rank registered services against a query.
   *
   * @param query - The free-text query from the consumer.
   * @returns The ranked matches the bridge returned.
   * @throws If the bridge replies with `error` or any non-`matches` kind.
   */
  async function queryServicesViaBridge(
    query: string,
  ): Promise<{ id: string; rationale: string }[]> {
    const reply = await bridgeRoundTrip({ kind: 'query', query });
    if (reply.kind === 'error') {
      throw new Error(`matcher vat: bridge query error: ${reply.message}`);
    }
    if (reply.kind !== 'matches') {
      throw new Error(
        `matcher vat: unexpected bridge reply kind for query: ${reply.kind}`,
      );
    }
    return reply.matches;
  }

  /**
   * Extract the peer ID portion of an OCAP URL.
   *
   * The URL grammar is `ocap:<oid>@<peerId>[,<relayHint>]*`. Returns
   * the empty string if the URL doesn't match — callers treat that as
   * "no peer info, can't dedup".
   *
   * @param contactUrl - The OCAP URL to parse.
   * @returns The peer ID, or '' if it can't be extracted.
   */
  function peerIdFromContactUrl(contactUrl: string): string {
    const at = contactUrl.indexOf('@');
    if (at < 0) {
      return '';
    }
    const rest = contactUrl.slice(at + 1);
    const comma = rest.indexOf(',');
    return comma < 0 ? rest : rest.slice(0, comma);
  }

  /**
   * Find every existing registry entry that shares (peerId, providerTag)
   * with the given description. Used to evict superseded entries when a
   * provider re-registers after a restart.
   *
   * @param description - The incoming registration's description.
   * @returns Array of registry ids of matching entries.
   */
  function findSamePeerSameTagEntries(
    description: ServiceDescription,
  ): string[] {
    const newPeerId = peerIdFromContactUrl(
      description.contact[0]?.contactUrl ?? '',
    );
    if (newPeerId === '') {
      return [];
    }
    const newTag = description.providerTag;
    const matches: string[] = [];
    for (const entry of registry.values()) {
      if (entry.description.providerTag !== newTag) {
        continue;
      }
      const existingPeerId = peerIdFromContactUrl(
        entry.description.contact[0]?.contactUrl ?? '',
      );
      if (existingPeerId === newPeerId) {
        matches.push(entry.id);
      }
    }
    return matches;
  }

  /**
   * Store a service in the in-memory registry, mirrored to baggage.
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
    const entry: RegisteredService = { id, description, contact };
    registry.set(id, entry);
    persistEntry(entry);
    log(`registered ${id}: ${description.description.slice(0, 80)}`);
    return id;
  }

  /**
   * Final step shared by all `register*` paths: evict any superseded
   * registrations, store the new entry locally, and tell the bridge. If
   * the bridge call fails, undo the local store so the registry never
   * contains entries the LLM doesn't know about.
   *
   * Eviction key is (peerId, providerTag) — see ServiceDescription's
   * `providerTag` for the contract. The dead `svc:N` entries that get
   * evicted here may still be cited by the LLM bridge's stale
   * conversation context; `findServices` filters those out via the
   * existing "bridge cited unknown id" guard.
   *
   * @param description - The validated service description.
   * @param contact - The validated contact endpoint.
   */
  async function commitRegistration(
    description: ServiceDescription,
    contact: ContactPoint,
  ): Promise<void> {
    // Stash superseded entries so we can restore them if the bridge
    // ingest fails — otherwise a transient bridge failure would
    // silently destroy whatever previous registration shared this
    // providerTag, defeating the atomicity property the dedup commit
    // was supposed to provide.
    const evicted: [string, RegisteredService][] = [];
    for (const supersededId of findSamePeerSameTagEntries(description)) {
      const prior = registry.get(supersededId);
      if (prior) {
        evicted.push([supersededId, prior]);
      }
      registry.delete(supersededId);
      removePersistedEntry(supersededId);
      log(
        `evicted superseded registration ${supersededId} (providerTag=${description.providerTag})`,
      );
    }
    const id = store(description, contact);
    try {
      await ingestService(id, description);
    } catch (cause) {
      registry.delete(id);
      removePersistedEntry(id);
      for (const [oldId, oldEntry] of evicted) {
        registry.set(oldId, oldEntry);
        persistEntry(oldEntry);
      }
      log(
        `bridge ingest failed for ${id}; rolled back new entry and restored ${evicted.length} evicted entries:`,
        cause,
      );
      throw cause;
    }
  }

  // Behavior methods for `defineDurableKindMulti` receive a context arg
  // (the per-instance `{ state, facets }` bag) before the caller-supplied
  // arguments. We don't use it here — per-instance state is empty and
  // the registry plus services live in closure — but the parameter
  // must be present or the real args end up shifted one slot right.
  const matcherBehaviorKit = {
    public: {
      async registerService(
        _context: unknown,
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
        await commitRegistration(description, contact);
      },

      async registerServiceByUrl(
        _context: unknown,
        contactUrl: string,
        registrationToken: RegistrationToken,
      ): Promise<void> {
        const contact = (await E(getServices().ocapURLRedemptionService).redeem(
          contactUrl,
        )) as ContactPoint;
        // Confirm FIRST: an attacker could flood us with registration
        // requests that point at legitimate URLs; doing anything else
        // with the contact before verifying the token would amplify that
        // into work the matcher performs on the victim's behalf.
        await confirmRegistration(contact, registrationToken);
        const description = await E(contact).getServiceDescription();
        await commitRegistration(description, contact);
      },

      async registerServiceByRef(
        _context: unknown,
        contact: ContactPoint,
        registrationToken: RegistrationToken,
      ): Promise<void> {
        // Confirm FIRST — see comment above in registerServiceByUrl.
        await confirmRegistration(contact, registrationToken);
        const description = await E(contact).getServiceDescription();
        await commitRegistration(description, contact);
      },

      async findServices(
        _context: unknown,
        query: ServiceQuery,
      ): Promise<ServiceMatch[]> {
        // Lazy re-sync: if we're holding registry entries the bridge
        // doesn't know about yet (e.g. we just re-incarnated from
        // baggage and the bridge process is fresh), re-ingest them
        // before delegating the query. Skips after the first call;
        // see the `bridgeIsCurrent` declaration at the top of
        // `buildRootObject` for the lifecycle.
        if (!bridgeIsCurrent && registry.size > 0) {
          log(`re-ingesting ${registry.size} restored service(s) into bridge`);
          for (const entry of registry.values()) {
            try {
              await ingestService(entry.id, entry.description);
            } catch (cause) {
              // Best-effort: a single failed re-ingest shouldn't sink
              // the query. Log and continue; the bridge's own
              // "cited unknown id" guard will silently filter
              // matches against the non-ingested entry.
              log(`re-ingest failed for ${entry.id}:`, cause);
            }
          }
          bridgeIsCurrent = true;
        }
        const ranked = await queryServicesViaBridge(query.description);
        const matches: ServiceMatch[] = [];
        let dropped = 0;
        for (const entry of ranked) {
          const registered = registry.get(entry.id);
          if (!registered) {
            // The bridge cited an id we no longer have — could happen if
            // the LLM hallucinates one, or if a service was unregistered
            // between ingest and query. Skip and log; don't bubble up.
            dropped += 1;
            log(`bridge cited unknown id ${entry.id}; skipping`);
            continue;
          }
          matches.push(
            harden({
              description: registered.description,
              rationale: entry.rationale,
            }),
          );
        }
        // If the bridge offered candidates and *all* of them were
        // unknown, the registry is either out of sync with the bridge or
        // the ranker is hallucinating ids wholesale. Loud failure is
        // better than silently returning [], which would be
        // indistinguishable from a legitimate zero-match query.
        if (ranked.length > 0 && matches.length === 0) {
          throw new Error(
            `matcher: LLM bridge cited only unknown ids (${dropped}/${ranked.length}); ` +
              'registry may be out of sync or ranker is hallucinating.',
          );
        }
        log(
          `findServices("${query.description.slice(0, 80)}") → ${matches.length} match(es)`,
        );
        return matches;
      },
    },

    observer: {
      /**
       * Read-only enumeration of the registry. Reached only via the
       * separate observer OCAP URL minted at bootstrap and surfaced to
       * operators via the vat root's admin-only `getObserverUrl()`.
       *
       * @param _context - The multi-facet `{ state, facets }` bag passed
       *   to every kit method by liveslots. Unused here; registry lives
       *   in closure.
       * @returns The registry contents (id + ServiceDescription).
       */
      listAll(
        _context: unknown,
      ): { id: string; description: ServiceDescription }[] {
        return [...registry.values()].map((entry) => ({
          id: entry.id,
          description: entry.description,
        }));
      },
    },
  };

  // Re-define the durable multi-facet kind on every incarnation so
  // liveslots can rebind both facets' behavior. The init function is
  // empty: per-instance state is unused; the registry plus services
  // live in closure-captured helpers above.
  const makeMatcherKit = VatData.defineDurableKindMulti(
    matcherKindHandle,
    () => harden({}),
    matcherBehaviorKit,
  );

  // Provide-or-create the singleton kit. On first incarnation this
  // allocates fresh krefs for both facets and stores them in baggage.
  // On re-incarnation, the stored refs are rehydrated to the same krefs.
  type MatcherKit = {
    public: ContactPoint;
    observer: { listAll: () => unknown };
  };
  let publicFacet: ContactPoint;
  let observerFacet: MatcherKit['observer'];
  if (baggage.has('publicFacet') && baggage.has('observerFacet')) {
    publicFacet = baggage.get('publicFacet') as ContactPoint;
    observerFacet = baggage.get('observerFacet') as MatcherKit['observer'];
  } else {
    const kit = makeMatcherKit() as unknown as MatcherKit;
    publicFacet = kit.public;
    observerFacet = kit.observer;
    if (!baggage.has('publicFacet')) {
      baggage.init('publicFacet', publicFacet);
    }
    if (!baggage.has('observerFacet')) {
      baggage.init('observerFacet', observerFacet);
    }
  }

  return makeDefaultExo('matcherVatRoot', {
    async bootstrap(_vats: Record<string, unknown>, incoming: Services) {
      if (!incoming?.ocapURLIssuerService) {
        throw new Error('ocapURLIssuerService is required');
      }
      if (!incoming.ocapURLRedemptionService) {
        throw new Error('ocapURLRedemptionService is required');
      }
      if (!incoming.llm) {
        throw new Error(
          'llm IOService is required (configure it in the cluster config under `io.llm`)',
        );
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
      const observerUrl = await E(incoming.ocapURLIssuerService).issue(
        observerFacet as unknown as ContactPoint,
      );
      // Stash both issued URLs. Useful for the "list-subclusters"
      // / "current-matcher-URL" workflow without having to re-issue,
      // and for operator tooling (demo-display) that needs the
      // observer URL out-of-band.
      if (baggage.has('matcherUrl')) {
        baggage.set('matcherUrl', matcherUrl);
      } else {
        baggage.init('matcherUrl', matcherUrl);
      }
      if (baggage.has('observerUrl')) {
        baggage.set('observerUrl', observerUrl);
      } else {
        baggage.init('observerUrl', observerUrl);
      }
      log(`bootstrap complete; matcherUrl=${matcherUrl}`);
      log(`observerUrl=${observerUrl}`);
      return harden({ matcherUrl, observerUrl });
    },

    getPublicFacet() {
      return publicFacet;
    },

    getObserverFacet() {
      return observerFacet;
    },

    /**
     * Return the matcher's public OCAP URL as previously issued by the
     * `ocapURLIssuerService` during bootstrap. Stable across vat
     * re-incarnations (the URL itself is deterministic given the durable
     * kref + persisted kernel identity, and we cache the issued value
     * in baggage).
     *
     * @returns The matcher OCAP URL, or `undefined` if bootstrap has
     * not yet run.
     */
    getMatcherUrl(): string | undefined {
      return baggage.has('matcherUrl')
        ? (baggage.get('matcherUrl') as string)
        : undefined;
    },

    /**
     * Return the observer facet's OCAP URL. Admin-only: callable only
     * via `daemon exec` on the matcher's own home, since the vat root
     * is not externally addressable. Operators hand this URL to
     * read-only enumeration consumers (e.g. demo-display) out-of-band.
     *
     * @returns The observer OCAP URL, or `undefined` if bootstrap has
     * not yet run.
     */
    getObserverUrl(): string | undefined {
      return baggage.has('observerUrl')
        ? (baggage.get('observerUrl') as string)
        : undefined;
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
        removePersistedEntry(id);
        log(`unregistered ${id}`);
      }
      return removed;
    },

    /**
     * Admin-side: wipe every registration. Empties the in-memory
     * registry and removes all `registry/<id>` entries from baggage.
     * The LLM bridge's conversation history is not touched — it
     * will continue to hold ingested digests of the now-cleared
     * services, but the matcher's "bridge cited unknown id" guard
     * in `findServices` filters those matches out so correctness is
     * preserved. The next provider re-registration triggers a fresh
     * ingest path and the bridge's stale-context drift converges
     * back to truth over subsequent registrations.
     *
     * Intended for explicit pre-demo "clear the slate" workflows.
     * For everyday restarts the registry persists; this is the
     * distinct, deliberate wipe operation.
     *
     * @returns The number of entries that were cleared.
     */
    clearRegistry(): { cleared: number } {
      const cleared = registry.size;
      registry.clear();
      const removedFromBaggage = clearAllPersistedEntries();
      // After a clear, there's nothing to re-ingest on the next
      // findServices call. Mark the bridge state as current so the
      // lazy re-sync skips its (empty) loop.
      bridgeIsCurrent = true;
      log(
        `registry cleared: ${cleared} in-memory entries, ` +
          `${removedFromBaggage} baggage entries removed`,
      );
      return harden({ cleared });
    },
  });
}
