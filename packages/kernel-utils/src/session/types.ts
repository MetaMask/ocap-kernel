/**
 * A request for a new section to be added to a session's sheaf. Produced by
 * application code that has discovered a target exo and constructed a point
 * guard covering the exact invocation it needs authority for.
 *
 * The `guard` field is an `@endo/patterns` InterfaceGuard — kept here as its
 * live form; the session marshals it to CapData before broadcasting.
 */
export type SectionRequest = {
  description: string;
  reason: string;
  schema?: unknown;
  guard: unknown; // InterfaceGuard — typed as unknown to avoid @endo/patterns dep here
  caveats: [];
};

/**
 * The wire representation of a {@link SectionRequest} sent to modal subscribers.
 * The guard is serialized as CapData so it can cross process boundaries as
 * NDJSON and be rendered by the TUI via prettifySmallcaps.
 */
export type SectionNotification = {
  token: string;
  description: string;
  reason: string;
  schema?: unknown;
  guard: { body: string; slots: string[] };
};

/**
 * A verdict rendered by a modal subscriber in response to a
 * {@link SectionNotification}.
 */
export type Decision = {
  token: string;
  verdict: 'accept' | 'reject';
  feedback: string;
  /** Optional guard override for accept verdicts. Absent means minimal (single-invocation) approval. */
  guard?: { body: string; slots: string[] };
};
