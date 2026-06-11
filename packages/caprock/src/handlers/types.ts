import type { RpcClient } from '../rpc.ts';
import type { CaprockEvent, SessionState } from '../types.ts';

/**
 * Persistent state operations the handlers depend on.
 *
 * Production binding is the `session.ts` module; tests pass an in-memory fake
 * that records calls and returns canned state.
 */
export type SessionStore = {
  loadSessionState(sessionId: string): Promise<SessionState | null>;
  saveSessionState(sessionId: string, state: SessionState): Promise<void>;
  appendEvent(sessionId: string, event: CaprockEvent): Promise<void>;
  readEvents(sessionId: string): Promise<CaprockEvent[]>;
  readSettingsAllowList(settingsPath: string): Promise<string[]>;
  readSettingsDenyList(settingsPath: string): Promise<string[]>;
};

/**
 * The dependency bag passed to every hook handler. Bundles RPC, storage,
 * clock, output sinks, and the paths/files derived once at startup.
 *
 * Handlers destructure the keys they need; the bin entry point constructs
 * the production binding and tests construct partial fakes.
 */
export type HookDeps = {
  rpc: RpcClient;
  store: SessionStore;
  /** Returns the current time as an ISO 8601 string. Injectable for tests. */
  now: () => string;
  /** Write a single chunk to stdout (no trailing newline added). */
  stdout: (chunk: string) => void;
  /** Write a single chunk to stderr (no trailing newline added). */
  stderr: (chunk: string) => void;
  /** UNIX socket path for the daemon. */
  socketPath: string;
  /** Absolute path to the compiled permission-tracker vat bundle. */
  vatBundlePath: string;
  /** Settings JSON files watched for the allow/deny snapshot union. */
  settingsPaths: string[];
  /**
   * Ensure the daemon is running, starting it in the background if not.
   * Resolves once the spawn has been issued (or immediately when the daemon
   * already responds to ping); does not wait for readiness — callers must
   * subsequently call {@link RpcClient.pingDaemon}.
   */
  ensureDaemon: () => Promise<void>;
  /**
   * Idempotent: append this plugin's `Bash(... status.sh|setup.sh|audit.sh)`
   * allow rules into `~/.claude/settings.json` so the helper scripts the
   * plugin ships don't trigger a permission prompt on first use.
   */
  registerSkillPermissions: () => Promise<void>;
  /**
   * Persist the `ocap modal <id>` command line for the current session into a
   * well-known file the TUI auto-discovers.
   */
  writeConnectFile: (connectCommand: string) => Promise<void>;
  /**
   * Absolute path to the per-session caprock JSONL event log. Used in the
   * SessionStart greeting so the user knows where to look.
   */
  caprockJsonlPath: (sessionId: string) => string;
};
