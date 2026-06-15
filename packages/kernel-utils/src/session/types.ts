import type { Struct } from '@metamask/superstruct';
import {
  array,
  enums,
  literal,
  object,
  optional,
  string,
  union,
} from '@metamask/superstruct';

/**
 * A single parsed command-or-tool invocation: the name and its positional args.
 * Used to describe what exactly was called before being converted to a Provision.
 */
export type ParsedInvocation = { name: string; argv: string[] };

export const ParsedInvocationStruct = object({
  name: string(),
  argv: array(string()),
}) as Struct<ParsedInvocation>;

/**
 * Pattern for one positional argument in a provision.
 *
 * - `exact`: the argument must equal the stored value exactly.
 * - `prefix`: the argument must start with the stored prefix (e.g. `/a/b/` for
 *   the glob `/a/b/*`).
 * - `wildcard`: any value is accepted.
 */
export type ArgPattern =
  | { kind: 'exact'; value: string }
  | { kind: 'prefix'; prefix: string }
  | { kind: 'wildcard' };

export const ArgPatternStruct = union([
  object({ kind: literal('exact'), value: string() }),
  object({ kind: literal('prefix'), prefix: string() }),
  object({ kind: literal('wildcard') }),
]) as Struct<ArgPattern>;

/**
 * Pattern for one component command/tool invocation in a provision.
 *
 * `name` is always matched exactly; each element of `argPatterns` corresponds
 * positionally to one argument of the invocation.
 */
export type InvocationPattern = {
  name: string;
  argPatterns: ArgPattern[];
};

export const InvocationPatternStruct = object({
  name: string(),
  argPatterns: array(ArgPatternStruct),
}) as Struct<InvocationPattern>;

/**
 * A standing preapproval: a neighborhood in invocation space.
 *
 * For Bash compound commands, `patterns` contains one entry per
 * pipe/chain component (cosheaf structure: all must match).
 * For other tools, `patterns` contains a single entry.
 */
export type Provision = {
  tool: string;
  patterns: InvocationPattern[];
};

export const ProvisionStruct = object({
  tool: string(),
  patterns: array(InvocationPatternStruct),
}) as Struct<Provision>;

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
  /** Parsed invocations for the request — present when routed through the PreToolUse hook. */
  invocations?: ParsedInvocation[];
  /** Independent pipeline clauses — present when the command has &&/||/; operators. */
  clauses?: ParsedInvocation[][];
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
  /** Optional standing preapprovals — one per independent clause. When present, simultaneously approves this request and registers each provision for future matching. */
  provisions?: Provision[];
};

export const GuardStruct = object({
  body: string(),
  slots: array(string()),
}) as Struct<{ body: string; slots: string[] }>;

export const DecisionStruct = object({
  token: string(),
  verdict: enums(['accept', 'reject']),
  feedback: string(),
  guard: optional(GuardStruct),
  provisions: optional(array(ProvisionStruct)),
}) as Struct<Decision>;

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
  status: 'pending' | 'accepted' | 'rejected' | 'provisioned';
  decidedAt?: string;
  /** Parsed invocations — present when routed through the PreToolUse hook. */
  invocations?: ParsedInvocation[];
  /** Independent pipeline clauses — present when the command has &&/||/; operators. */
  clauses?: ParsedInvocation[][];
  /** Standing provisions that were granted — one per independent clause when user accepted with provisions. */
  provisions?: Provision[];
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
    provisions?: Provision[],
  ) => Promise<void>;
};
