export type { Decision } from '@metamask/kernel-utils/session';

export type HookVersionRecord = {
  version: string;
  recordedAt: string;
};

export type SessionState = {
  sessionId: string;
  kernelSessionId: string;
  ocapUrl: string;
  rootKref: string;
  subclusterId: string;
  startedAt: string;
  settingsSnapshot: string[];
  settingsDenySnapshot?: string[];
  /**
   * Version of the permission-tracker vat that backs this session. Stamped
   * once at session start via the vat's `getVersion` exo method; immutable
   * thereafter (the vat instance lives for the life of the session). Absent
   * on session-state files created before the version-tracking feature.
   */
  vatVersion?: string;
  /**
   * Append-only log of the hook binary versions observed for this session.
   * First entry is recorded at session start; new entries are appended when a
   * hook invocation detects that `deps.hookVersion` has changed from the last
   * recorded value (also emitted as a `version_up` event). Absent on
   * session-state files created before the version-tracking feature; in that
   * case detection is skipped — no retroactive backfill.
   */
  hookVersionHistory?: HookVersionRecord[];
};

export type CaprockEventKind =
  | 'session_start'
  | 'session_end'
  | 'check'
  | 'grant'
  | 'prompted'
  | 'denied'
  | 'rule_grant'
  | 'tui_accept'
  | 'tui_reject'
  | 'connect_hint'
  | 'provision_match'
  | 'provision_revoke'
  | 'version_up';

export type CaprockEvent = {
  t: string;
  event: CaprockEventKind;
  sessionId: string;
} & Record<string, unknown>;

export type CapData = {
  body: string;
  slots: string[];
};

// Stdin payloads from Claude Code CLI hooks

export type HookPayloadBase = {
  session_id: string;
  transcript_path: string;
  hook_event_name: string;
  cwd?: string;
};

export type PreToolUsePayload = HookPayloadBase & {
  hook_event_name: 'PreToolUse';
  tool_name: string;
  tool_input: Record<string, unknown>;
};

export type PostToolUsePayload = HookPayloadBase & {
  hook_event_name: 'PostToolUse';
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response: {
    output?: string;
    error?: string | null;
    interrupted?: boolean;
  };
  duration_ms?: number;
};

export type PermissionRequestPayload = HookPayloadBase & {
  hook_event_name: 'PermissionRequest';
  tool_name?: string;
  tool_input?: Record<string, unknown>;
};

export type PermissionDeniedPayload = HookPayloadBase & {
  hook_event_name: 'PermissionDenied';
  tool_name?: string;
  tool_input?: Record<string, unknown>;
};

export type FileChangedPayload = HookPayloadBase & {
  hook_event_name: 'FileChanged';
  file_path: string;
  change_type: 'create' | 'modify' | 'delete';
};

export type SessionEndPayload = HookPayloadBase & {
  hook_event_name: 'SessionEnd';
};

export type SessionStartPayload = HookPayloadBase & {
  hook_event_name: 'SessionStart';
};

export type AnyHookPayload =
  | SessionStartPayload
  | PreToolUsePayload
  | PostToolUsePayload
  | PermissionRequestPayload
  | PermissionDeniedPayload
  | FileChangedPayload
  | SessionEndPayload;
