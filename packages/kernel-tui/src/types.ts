import type {
  Provision,
  SessionApi,
  SessionSummary,
  PendingRequest,
  SessionHistoryEntry,
} from '@metamask/kernel-utils/session';

export type { SessionSummary, PendingRequest, SessionHistoryEntry };

export type KernelStatus = {
  active: boolean;
  vatCount: number;
  subclusterCount: number;
};

export type RegistryEntry = { key: string; value: string };

export type ViewMode = 'sessions' | 'files' | 'objects' | 'invoke' | 'log';

export type KernelApi = SessionApi & {
  listHistory: (sessionId: string) => Promise<SessionHistoryEntry[]>;
  launchSubcluster(config: Record<string, unknown>): Promise<{
    subclusterId: string;
    bootstrapRootKref: string;
    bootstrapResult?: unknown;
  }>;
  queueMessage(
    target: string,
    method: string,
    args: unknown[],
  ): Promise<unknown>;
  getStatus(): Promise<KernelStatus>;
  getObjectRegistry(): Promise<RegistryEntry[]>;
  /**
   * Revoke a standing provision held by the named session's permission-tracker
   * vat and record the revocation in the caprock event log (best-effort — a
   * session with no caprock state file just drops the vat section).
   */
  revoke(sessionId: string, provision: Provision): Promise<void>;
  stop(): Promise<void>;
};
