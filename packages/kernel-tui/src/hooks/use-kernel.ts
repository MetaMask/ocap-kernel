import {
  getSocketPath,
  sendCommand,
} from '@metamask/kernel-node-runtime/daemon';
import { useEffect, useRef, useState } from 'react';

import type { KernelApi, KernelStatus } from '../types.ts';

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
    params?: Record<string, unknown>,
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
      return send<unknown>('queueMessage', { target, method, args });
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
      return send<{ sessionId: string; ocapUrl: string }[]>('session.list');
    },

    async listRequests(sessionId) {
      return send<{ token: string; description: string; reason: string }[]>(
        'session.requests',
        { sessionId },
      );
    },

    async decide(sessionId, token, verdict) {
      await send('session.decide', { sessionId, token, verdict, feedback: '' });
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
