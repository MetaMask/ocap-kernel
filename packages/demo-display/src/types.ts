/**
 * Event types broadcast by the demo-display server. SSE clients receive
 * each event with `event: <kind>` and `data: <JSON>` lines.
 *
 * The shape of the `description` field for `service.registered` mirrors
 * `ServiceDescription` from `@metamask/service-discovery-types`, but the
 * SSE consumer reads it as JSON; it is duck-typed here so an external
 * consumer of the SSE stream does not need to depend on the same
 * package.
 */
export type ServiceRegisteredEvent = {
  kind: 'service.registered';
  id: string;
  description: ServiceDescriptionPayload;
  at: string;
};

export type ServiceEvictedEvent = {
  kind: 'service.evicted';
  id: string;
  at: string;
};

export type DisplayEvent = ServiceRegisteredEvent | ServiceEvictedEvent;

/**
 * Loose, JSON-serializable mirror of `ServiceDescription`. We intentionally
 * do not depend on the typed struct from `@metamask/service-discovery-types`
 * for the wire payload — SSE consumers read this as plain JSON.
 */
export type ServiceDescriptionPayload = {
  providerTag: string;
  description: string;
  methods: Record<string, unknown>;
  capabilities?: string[];
  priceUsd?: number;
  [key: string]: unknown;
};
