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

/**
 * The agent invoked a tool. The demo plugin posts these so the
 * transcript panel can render a live activity log.
 */
export type ToolCallEvent = {
  kind: 'tool.call';
  toolName: string;
  args?: unknown;
  at: string;
};

/**
 * The agent received a tool result.
 */
export type ToolResultEvent = {
  kind: 'tool.result';
  toolName: string;
  result?: unknown;
  at: string;
};

/**
 * The agent recorded an artifact (concept sketch, PCB layout, etc.).
 * Carries enough payload for the artifact panel to render the latest
 * one full-size and the workflow board to render a thumbnail card.
 */
export type ArtifactRecordedEvent = {
  kind: 'artifact.recorded';
  handle: string;
  artifactKind: 'svg' | 'image' | 'markdown' | 'json' | string;
  data: string;
  fromService: string;
  metadata?: { title?: string; summary?: string };
  at: string;
};

/**
 * The agent advanced to a new workflow phase. The workflow board
 * tracks the active phase pointer from these events.
 */
export type PhaseAnnouncedEvent = {
  kind: 'phase.announced';
  phase: string;
  at: string;
};

/**
 * A free-text narration line from the agent, surfaced under the
 * workflow board.
 */
export type AgentNoteEvent = {
  kind: 'agent.note';
  note: string;
  at: string;
};

/**
 * The inventor's wallet balance, in USD. Drives the always-visible
 * wallet ribbon. Emitted at agent startup (initial value) and on any
 * change.
 */
export type WalletBalanceEvent = {
  kind: 'wallet.balance';
  balanceUsd: number;
  at: string;
};

export type DisplayEvent =
  | ServiceRegisteredEvent
  | ServiceEvictedEvent
  | ToolCallEvent
  | ToolResultEvent
  | ArtifactRecordedEvent
  | PhaseAnnouncedEvent
  | AgentNoteEvent
  | WalletBalanceEvent;

/**
 * Loose, JSON-serializable mirror of `ServiceDescription`. We intentionally
 * do not depend on the typed struct from `@metamask/service-discovery-types`
 * for the wire payload — SSE consumers read this as plain JSON.
 *
 * Method names live nested under
 * `apiSpec.properties.<key>.type.spec.methods`, not at the top level.
 */
export type ServiceDescriptionPayload = {
  providerTag: string;
  description: string;
  apiSpec?: unknown;
  priceUsd?: number;
  [key: string]: unknown;
};
