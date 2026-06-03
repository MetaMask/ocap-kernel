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

export type ServiceDescriptionPayload = {
  providerTag: string;
  description: string;
  methods: Record<string, unknown>;
  capabilities?: string[];
  priceUsd?: number;
  [key: string]: unknown;
};
