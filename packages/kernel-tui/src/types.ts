import type {
  SessionApi,
  SessionSummary,
  PendingRequest,
} from '@metamask/kernel-utils/session';

export type { SessionSummary, PendingRequest };

export type KernelStatus = {
  active: boolean;
  vatCount: number;
  subclusterCount: number;
};

export type RegistryEntry = { key: string; value: string };

export type ViewMode = 'sessions' | 'files' | 'objects' | 'invoke' | 'log';

export type KernelApi = SessionApi & {
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
  stop(): Promise<void>;
};
