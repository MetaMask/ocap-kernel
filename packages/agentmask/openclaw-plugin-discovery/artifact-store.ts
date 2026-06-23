/**
 * Process-global artifact store shared between `@openclaw/discovery`
 * (which interns `service_call` results) and `@openclaw/demo` (which
 * records artifacts for the dashboard). The two plugins live in the
 * same openclaw process, but the plugin runtime doesn't give them a
 * shared context, so we key the singleton off a well-known
 * `Symbol.for` slot on `globalThis`. Both plugins ship their own copy
 * of this file; they refer to the same store.
 *
 * Allowed artifact kinds are pinned to a published whitelist so a
 * future service result that happens to share the `{ kind, data,
 * fromService, … }` shape but isn't an artifact (e.g. a status
 * response with a `kind: "success"`) doesn't get accidentally
 * interned. New kinds get added here as services land.
 */
const STORE_KEY = Symbol.for('@ocap/agentmask/artifact-store/v1');

/**
 * Artifact kinds the store recognises. Service results carrying one
 * of these as their `kind` field are eligible to be interned by
 * `service_call`.
 */
export const ARTIFACT_KINDS = [
  'svg',
  'image',
  'markdown',
  'json',
  'c-source',
] as const;

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

/**
 * Inter-service handoff record. Services that talk to another
 * service via ocap during their work attach one of these per call so
 * the demo plugin can post a `service.interaction` event to the
 * dashboard when the artifact is recorded. The actual cross-vat
 * ocap invocation happens inside the source service via
 * OcapURLRedemptionService; this is the parallel record for the
 * audience-facing event log.
 */
export type ServiceInteraction = {
  /** Provider tag of the service that initiated the call. */
  from: string;
  /** Provider tag of the service that received the call. */
  to: string;
  /** Short human-readable description, e.g. "parts shipment manifest". */
  interaction: string;
};

export type StoredArtifact = {
  handle: string;
  kind: ArtifactKind;
  data: string;
  fromService: string;
  metadata?: { title?: string; summary?: string };
  /**
   * Inter-service handoffs that took place while producing this
   * artifact. The demo plugin reads these and emits a separate
   * `service.interaction` event per entry. Suppliers attach a single
   * shipment-acknowledged entry; assemblers attach none (they only
   * receive). Optional — most artifacts are agent-to-service or
   * service-to-agent and carry no inter-service flavor.
   */
  interactions?: ServiceInteraction[];
  /**
   * Receive-shipment ocap URL exposed by assembler-like services so
   * suppliers can hand off parts and boards directly via the kernel's
   * ocap-URL machinery. The agent forwards this string verbatim as
   * the `shipToUrl` argument when invoking supplier commit methods;
   * the supplier redeems it and calls the receive method.
   */
  receiveShipmentUrl?: string;
};

type StoreState = {
  artifacts: Map<string, StoredArtifact>;
  nextSeq: number;
};

export type ArtifactStore = {
  /**
   * Intern an artifact, allocating a fresh handle.
   *
   * @param artifact - The artifact fields excluding `handle`.
   * @returns The stored artifact with its allocated handle.
   */
  intern(artifact: Omit<StoredArtifact, 'handle'>): StoredArtifact;
  /**
   * Look up an artifact by handle.
   *
   * @param handle - The handle to resolve.
   * @returns The stored artifact, or `undefined` if no such handle exists.
   */
  get(handle: string): StoredArtifact | undefined;
};

/**
 * Detect the artifact-shaped value convention. A service result is
 * considered an artifact when it's an object literal with a `kind`
 * in the published whitelist, a non-empty string `data`, and a
 * string `fromService`.
 *
 * @param value - The candidate value (typically a `service_call` result).
 * @returns Whether the value is an interable artifact.
 */
export function isArtifactShape(
  value: unknown,
): value is Omit<StoredArtifact, 'handle'> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.kind !== 'string') {
    return false;
  }
  if (!(ARTIFACT_KINDS as readonly string[]).includes(record.kind)) {
    return false;
  }
  if (typeof record.data !== 'string' || record.data.length === 0) {
    return false;
  }
  if (typeof record.fromService !== 'string') {
    return false;
  }
  return true;
}

/**
 * Return the process-global artifact store, lazily constructing it on
 * first call. Both plugins call this to get a handle on the shared
 * Map.
 *
 * @returns The shared artifact store interface.
 */
export function getArtifactStore(): ArtifactStore {
  const slot = globalThis as Record<symbol, StoreState | undefined>;
  let state = slot[STORE_KEY];
  if (state === undefined) {
    state = { artifacts: new Map(), nextSeq: 0 };
    slot[STORE_KEY] = state;
  }
  const live = state;
  return {
    intern(artifact: Omit<StoredArtifact, 'handle'>): StoredArtifact {
      const handle = `artifact-${live.nextSeq}`;
      live.nextSeq += 1;
      const stored: StoredArtifact = { ...artifact, handle };
      live.artifacts.set(handle, stored);
      return stored;
    },
    get(handle: string): StoredArtifact | undefined {
      return live.artifacts.get(handle);
    },
  };
}
