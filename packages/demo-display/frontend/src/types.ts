/**
 * Event types broadcast by the demo-display server. Duplicates the
 * server's `src/types.ts` so the frontend doesn't need a cross-target
 * import (DOM vs Node tsconfigs).
 *
 * Keep in lockstep with `packages/demo-display/src/types.ts`. The wire
 * format is JSON, so a missing field on either side fails open
 * (`undefined`) rather than crashing.
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
 * Loose, JSON-serializable mirror of the matcher's `ServiceDescription`.
 * Only the fields the frontend actually renders are typed; the rest of
 * the structure (contact array, full apiSpec) is allowed through as
 * unknown.
 *
 * Method names live nested under `apiSpec.properties.<key>.type.spec.methods`
 * — see `extractMethodNames()` in components/MarketplaceGrid.tsx.
 */
export type ServiceDescriptionPayload = {
  providerTag: string;
  description: string;
  apiSpec?: ApiSpecPayload;
  priceUsd?: number;
  [key: string]: unknown;
};

export type ApiSpecPayload = {
  properties?: Record<string, ApiPropertyPayload>;
};

export type ApiPropertyPayload = {
  type?: {
    kind?: string;
    spec?: {
      methods?: Record<string, unknown>;
    };
  };
};
