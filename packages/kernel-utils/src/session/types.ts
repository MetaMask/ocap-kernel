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

/** User-facing summary of a session returned by the session list API. */
export type SessionSummary = {
  sessionId: string;
  ocapUrl: string;
  /** Working directory of the process that created this session. */
  cwd?: string;
  /** ISO 8601 timestamp of when the session was created. */
  startedAt?: string;
};

/** User-facing representation of a pending authorization request. */
export type PendingRequest = {
  token: string;
  description: string;
  reason: string;
};

/** A single entry in a session's request timeline — either pending or decided. */
export type SessionHistoryEntry = {
  token: string;
  description: string;
  reason: string;
  guard: { body: string; slots: string[] };
  queuedAt: string;
  status: 'pending' | 'accepted' | 'rejected';
  decidedAt?: string;
};

/**
 * Transport-agnostic interface for inspecting and deciding on authorization
 * requests. Shared between the TUI (Unix-socket JSON-RPC) and the browser
 * extension (browser-kernel RPC).
 */
export type SessionApi = {
  listSessions: () => Promise<SessionSummary[]>;
  listRequests: (sessionId: string) => Promise<PendingRequest[]>;
  decide: (
    sessionId: string,
    token: string,
    verdict: 'accept' | 'reject',
  ) => Promise<void>;
};
