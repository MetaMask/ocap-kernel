import {
  getSocketPath,
  sendCommand,
} from '@metamask/kernel-node-runtime/daemon';
import { getOcapHome } from '@metamask/kernel-utils/nodejs';
import type {
  ParsedInvocation,
  Provision,
} from '@metamask/kernel-utils/session';
import { appendFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { useEffect, useRef, useState } from 'react';

import type { KernelApi, KernelStatus } from '../types.ts';

type CaprockSessionStateOnDisk = {
  sessionId: string;
  kernelSessionId: string;
  rootKref: string;
};

/**
 * Locate the caprock SessionState JSON file whose `kernelSessionId` matches
 * the given kernel session, returning enough of it for revoke routing.
 *
 * @param kernelSessionId - The kernel session as reported by the daemon.
 * @returns The caprock state, or `null` if no matching session is found.
 */
async function findCaprockSessionByKernelId(
  kernelSessionId: string,
): Promise<CaprockSessionStateOnDisk | null> {
  const caprockDir = join(getOcapHome(), 'caprock');
  let entries: string[];
  try {
    entries = await readdir(caprockDir);
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.endsWith('.json')) {
      continue;
    }
    try {
      const raw = await readFile(join(caprockDir, entry), 'utf8');
      const parsed = JSON.parse(raw) as Partial<CaprockSessionStateOnDisk>;
      if (
        typeof parsed.sessionId === 'string' &&
        typeof parsed.kernelSessionId === 'string' &&
        typeof parsed.rootKref === 'string' &&
        parsed.kernelSessionId === kernelSessionId
      ) {
        return {
          sessionId: parsed.sessionId,
          kernelSessionId: parsed.kernelSessionId,
          rootKref: parsed.rootKref,
        };
      }
    } catch {
      // ignore unreadable / malformed entries
    }
  }
  return null;
}

/**
 * Create a {@link KernelApi} that communicates with the daemon over a UNIX
 * domain socket using JSON-RPC.
 *
 * @param socketPath - The daemon socket path (defaults to the standard path).
 * @returns A {@link KernelApi} backed by the daemon.
 */
export function makeDaemonKernelApi(
  socketPath: string = getSocketPath(),
): KernelApi {
  const send = async <T>(
    method: string,
    params?: Record<string, unknown> | unknown[],
  ): Promise<T> => {
    const response = await sendCommand({ socketPath, method, params });
    if ('error' in response) {
      const rpcError = response.error as { message: string };
      throw new Error(rpcError.message);
    }
    return response.result as T;
  };

  return {
    async launchSubcluster(config) {
      return send<{
        subclusterId: string;
        bootstrapRootKref: string;
        bootstrapResult?: unknown;
      }>('launchSubcluster', config);
    },

    async queueMessage(target, method, args) {
      return send<unknown>('queueMessage', [target, method, args]);
    },

    async getStatus() {
      const result = await send<{ vats: unknown[]; subclusters: unknown[] }>(
        'getStatus',
      );
      return {
        active: result.vats.length > 0,
        vatCount: result.vats.length,
        subclusterCount: result.subclusters.length,
      };
    },

    async getObjectRegistry() {
      const rows = await send<Record<string, string>[]>('executeDBQuery', {
        sql: 'SELECT key, value FROM kv',
      });
      return rows.map((row) => ({
        key: row.key ?? '',
        value: row.value ?? '',
      }));
    },

    async stop() {
      await send('shutdown');
    },

    async listSessions() {
      return send<
        {
          sessionId: string;
          ocapUrl: string;
          cwd?: string;
          startedAt?: string;
        }[]
      >('session.list');
    },

    async listRequests(sessionId) {
      return send<{ token: string; description: string; reason: string }[]>(
        'session.requests',
        { sessionId },
      );
    },

    async listHistory(sessionId) {
      return send<
        {
          token: string;
          description: string;
          reason: string;
          guard: { body: string; slots: string[] };
          queuedAt: string;
          status: 'pending' | 'accepted' | 'rejected';
          decidedAt?: string;
          invocations?: ParsedInvocation[];
        }[]
      >('session.history', { sessionId });
    },

    async decide(sessionId, token, verdict, provisions) {
      await send('session.decide', {
        sessionId,
        token,
        verdict,
        feedback: '',
        ...(provisions === undefined ? {} : { provisions }),
      });
    },

    async revoke(sessionId: string, provision: Provision): Promise<void> {
      const state = await findCaprockSessionByKernelId(sessionId);
      if (state === null) {
        throw new Error(
          `No caprock session linked to kernel session ${sessionId}; cannot revoke`,
        );
      }
      const result = await send<{ body: string; slots: string[] }>(
        'queueMessage',
        [state.rootKref, 'removeSection', [provision]],
      );
      const removed =
        result.body.startsWith('#') &&
        JSON.parse(result.body.slice(1)) === true;
      if (!removed) {
        throw new Error('No matching provision in vat');
      }
      const eventLine = `${JSON.stringify({
        t: new Date().toISOString(),
        event: 'provision_revoke',
        sessionId: state.sessionId,
        provision,
      })}\n`;
      await appendFile(
        join(getOcapHome(), 'caprock', `${state.sessionId}.jsonl`),
        eventLine,
      );
    },
  };
}

/**
 * React hook that fetches and tracks kernel status.
 *
 * @param kernelApi - The kernel API to use.
 * @returns Kernel status, any error string, and a manual refresh callback.
 */
export function useKernel(kernelApi: KernelApi): {
  status: KernelStatus | null;
  error: string | null;
  refreshStatus: () => void;
} {
  const [status, setStatus] = useState<KernelStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refreshStatus = (): void => {
    kernelApi
      .getStatus()
      .then((newStatus) => {
        if (mountedRef.current) {
          setStatus(newStatus);
        }
        return undefined;
      })
      .catch((caught: Error) => {
        if (mountedRef.current) {
          setError(caught.message);
        }
      });
  };

  useEffect(() => {
    mountedRef.current = true;
    refreshStatus();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return { status, error, refreshStatus };
}
