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

export type ServiceDiscoveredEvent = {
  kind: 'service.discovered';
  providerTag: string;
  /**
   * Full matcher-returned service description for the discovered
   * provider. Drives the services map (so the SPA doesn't need a
   * periodic `listAll` poll). Optional only for backward
   * compatibility with older plugin builds; current builds always
   * set it.
   */
  description?: ServiceDescriptionPayload;
  at: string;
};

export type MatcherQueryEvent = {
  kind: 'matcher.query';
  description: string;
  at: string;
};

export type MatcherResultsEvent = {
  kind: 'matcher.results';
  count: number;
  providerTags: string[];
  at: string;
};

export type ToolCallEvent = {
  kind: 'tool.call';
  toolName: string;
  args?: unknown;
  at: string;
};

export type ToolResultEvent = {
  kind: 'tool.result';
  toolName: string;
  result?: unknown;
  at: string;
};

export type ArtifactRecordedEvent = {
  kind: 'artifact.recorded';
  handle: string;
  artifactKind: 'svg' | 'image' | 'markdown' | 'json' | string;
  data: string;
  fromService: string;
  metadata?: { title?: string; summary?: string };
  phase?: string;
  /**
   * Handles of earlier artifacts that were passed (as inputs) to the
   * service call that produced this one. The workflow board draws a
   * lineage edge from each consumed card to this one.
   */
  consumes?: string[];
  at: string;
};

export type PhaseAnnouncedEvent = {
  kind: 'phase.announced';
  phase: string;
  at: string;
};

export type AgentNoteEvent = {
  kind: 'agent.note';
  note: string;
  at: string;
};

export type WalletBalanceEvent = {
  kind: 'wallet.balance';
  balanceUsd: number;
  at: string;
};

export type WalletChargeEvent = {
  kind: 'wallet.charge';
  amountUsd: number;
  reason?: string;
  balanceUsd: number;
  at: string;
};

export type WalletCreditEvent = {
  kind: 'wallet.credit';
  amountUsd: number;
  reason?: string;
  balanceUsd: number;
  at: string;
};

/**
 * One service called another via ocap (e.g. shenzhen-direct shipping
 * parts to assembly-coop via the assembler's receive-shipment ocap).
 * The demo plugin emits this event when it records a supplier
 * artifact whose `interactions` field carries an entry; the actual
 * cross-vat ocap call happens inside the supplier vat. Rendered
 * distinctly in the events log so the audience can see inter-service
 * handshakes separately from agent narration.
 */
export type ServiceInteractionEvent = {
  kind: 'service.interaction';
  from: string;
  to: string;
  interaction: string;
  at: string;
};

export type DisplayEvent =
  | ServiceRegisteredEvent
  | ServiceEvictedEvent
  | ServiceDiscoveredEvent
  | MatcherQueryEvent
  | MatcherResultsEvent
  | ToolCallEvent
  | ToolResultEvent
  | ArtifactRecordedEvent
  | PhaseAnnouncedEvent
  | AgentNoteEvent
  | WalletBalanceEvent
  | WalletChargeEvent
  | WalletCreditEvent
  | ServiceInteractionEvent;

/**
 * Loose, JSON-serializable mirror of the matcher's `ServiceDescription`.
 * Only the fields the frontend actually renders are typed; the rest of
 * the structure (contact array, full apiSpec) is allowed through as
 * unknown.
 *
 * Method names live nested under `apiSpec.properties.<key>.type.spec.methods`
 * — see `extractMethodNames()` in components/ServicesGrid.tsx.
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
