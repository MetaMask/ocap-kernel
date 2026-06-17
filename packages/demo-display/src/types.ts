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
 * The agent's `discovery_find_services` query matched this provider.
 * Services-grid cards surface only providers that have been discovered;
 * the registry-truth `service.registered` stream is used internally for
 * lookups but never directly drives the services UI.
 */
export type ServiceDiscoveredEvent = {
  kind: 'service.discovered';
  providerTag: string;
  at: string;
};

/**
 * The agent asked the matcher to find services. Surfaced in the
 * transcript so the audience can see the matcher being consulted, not
 * just the agent's downstream actions.
 */
export type MatcherQueryEvent = {
  kind: 'matcher.query';
  description: string;
  at: string;
};

/**
 * The matcher replied to a previous `matcher.query` with this set of
 * provider tags (or none).
 */
export type MatcherResultsEvent = {
  kind: 'matcher.results';
  count: number;
  providerTags: string[];
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
  /**
   * Workflow phase the artifact belongs to. When the demo plugin's
   * `demo_record_artifact` is called with an explicit `phase` arg the
   * value lands here; otherwise the reducer falls back to whatever
   * phase was active at receive time. Always set this explicitly when
   * the agent might be running phases out of order or in parallel.
   */
  phase?: string;
  /**
   * Handles of earlier artifacts that the producing service call took
   * as inputs. The workflow board draws a lineage edge from each
   * consumed card to this one, so the audience can see how outputs
   * were derived from earlier work. Empty / undefined when the
   * producing call took no prior artifacts.
   */
  consumes?: string[];
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

/**
 * A spend just deducted from the wallet. Renders as a transcript line
 * so the audience sees money moving alongside the ribbon ticking down.
 */
export type WalletChargeEvent = {
  kind: 'wallet.charge';
  amountUsd: number;
  reason?: string;
  balanceUsd: number;
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
  | WalletChargeEvent;

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
