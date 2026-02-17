import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import { describe, it, expect, beforeEach } from 'vitest';

import { buildRootObject } from './system-console-vat.ts';

/**
 * Create a mock baggage store.
 *
 * @returns A mock baggage with has/get/set/init methods.
 */
function makeMockBaggage() {
  const store = new Map<string, unknown>();
  return {
    has: (key: string) => store.has(key),
    get: (key: string) => store.get(key),
    set: (key: string, value: unknown) => store.set(key, value),
    init: (key: string, value: unknown) => {
      if (store.has(key)) {
        throw new Error(`Key already exists: ${key}`);
      }
      store.set(key, value);
    },
  };
}

/**
 * Create a mock IO service with controllable read queue.
 *
 * @returns Mock IO service and control functions.
 */
function makeMockIOService() {
  const readQueue: (string | null)[] = [];
  const pendingReads: ((value: string | null) => void)[] = [];
  const written: string[] = [];

  return {
    ioService: makeDefaultExo('mockIOService', {
      async read() {
        const queued = readQueue.shift();
        if (queued !== undefined) {
          return queued;
        }
        return new Promise<string | null>((resolve) => {
          pendingReads.push(resolve);
        });
      },
      async write(data: string) {
        written.push(data);
      },
    }),
    deliverLine(line: string): void {
      const reader = pendingReads.shift();
      if (reader) {
        reader(line);
      } else {
        readQueue.push(line);
      }
    },
    deliverEOF(): void {
      const reader = pendingReads.shift();
      if (reader) {
        reader(null);
      } else {
        readQueue.push(null);
      }
    },
    get written() {
      return written;
    },
  };
}

/**
 * Create a mock kernel facet using plain functions (not vi.fn) to avoid
 * SES lockdown issues with frozen mock internals.
 *
 * @returns A mock kernel facet and call trackers.
 */
function makeMockKernelFacet() {
  const calls: Record<string, unknown[][]> = {
    getStatus: [],
    getSubclusters: [],
    invokeMethod: [],
    launchSubcluster: [],
    terminateSubcluster: [],
  };

  const facet = makeDefaultExo('mockKernelFacet', {
    async invokeMethod(...args: unknown[]) {
      calls.invokeMethod.push(args);
      return { mocked: true };
    },
    async getStatus(...args: unknown[]) {
      calls.getStatus.push(args);
      return {
        incarnation: 1,
        subclusters: 0,
        vats: 1,
        pendingMessages: 0,
      };
    },
    async getSubclusters(...args: unknown[]) {
      calls.getSubclusters.push(args);
      return [];
    },
    async launchSubcluster(...args: unknown[]) {
      calls.launchSubcluster.push(args);
      return {
        subclusterId: 'sub-1',
        rootKref: 'ko1',
        bootstrapResult: undefined,
      };
    },
    async terminateSubcluster(...args: unknown[]) {
      calls.terminateSubcluster.push(args);
    },
  });

  return { facet, calls };
}

describe('system-console-vat', () => {
  let baggage: ReturnType<typeof makeMockBaggage>;
  let kernelFacet: ReturnType<typeof makeMockKernelFacet>;
  let io: ReturnType<typeof makeMockIOService>;

  beforeEach(() => {
    baggage = makeMockBaggage();
    kernelFacet = makeMockKernelFacet();
    io = makeMockIOService();
  });

  describe('bootstrap', () => {
    it('stores kernel facet in baggage', async () => {
      const root = buildRootObject(
        {},
        { name: 'test-console' },
        baggage as never,
      );
      await root.bootstrap({}, { kernelFacet: kernelFacet.facet });
      expect(baggage.has('kernelFacet')).toBe(true);
    });

    it('starts REPL loop when console IO service is provided', async () => {
      const root = buildRootObject(
        {},
        { name: 'test-console' },
        baggage as never,
      );
      await root.bootstrap(
        {},
        {
          kernelFacet: kernelFacet.facet,
          console: io.ioService,
        },
      );

      // Give it a tick to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Send a help command — if the REPL loop is running, it will respond
      io.deliverLine(JSON.stringify({ method: 'help' }));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(io.written.length).toBeGreaterThan(0);
    });
  });

  describe('REPL dispatch (daemon tier)', () => {
    async function setupRepl() {
      const root = buildRootObject(
        {},
        { name: 'test-console' },
        baggage as never,
      );
      await root.bootstrap(
        {},
        {
          kernelFacet: kernelFacet.facet,
          console: io.ioService,
        },
      );
      await new Promise((resolve) => setTimeout(resolve, 10));
      return root;
    }

    async function sendRequest(request: Record<string, unknown>) {
      io.deliverLine(JSON.stringify(request));
      await new Promise((resolve) => setTimeout(resolve, 50));
      const lastWrite = io.written[io.written.length - 1];
      return JSON.parse(lastWrite!) as {
        ok: boolean;
        result?: unknown;
        error?: string;
      };
    }

    it('dispatches help command with daemon-tier commands only', async () => {
      await setupRepl();
      const response = await sendRequest({ method: 'help' });

      expect(response.ok).toBe(true);
      expect(response.result).toStrictEqual({
        commands: ['help - show available commands', 'status - daemon status'],
      });
    });

    it('dispatches status command returning liveness indicator', async () => {
      await setupRepl();
      const response = await sendRequest({ method: 'status' });

      expect(response).toStrictEqual({
        ok: true,
        result: { running: true },
      });
    });

    it.each(['launch', 'terminate', 'subclusters', 'ls', 'revoke', 'invoke'])(
      'returns "Unknown command" for privileged command "%s"',
      async (method) => {
        await setupRepl();
        const response = await sendRequest({ method });

        expect(response.ok).toBe(false);
        expect(response.error).toContain('Unknown command');
      },
    );

    it('dispatches self-ref REPL command directly on root', async () => {
      const root = await setupRepl();
      const ref = root.issueRef('ko-self', true);
      const response = await sendRequest({ ref, method: 'help' });

      expect(response.ok).toBe(true);
      expect(response.result).toStrictEqual({
        commands: [
          'help - show available commands',
          'status - kernel status',
          'subclusters - list subclusters',
          'launch <config> - launch a subcluster',
          'terminate <subclusterId> - terminate a subcluster',
          'ls - list all issued refs',
          'revoke <ref> - revoke a ref',
          'invoke <ref> <method> [...args] - call a method on a ref',
        ],
      });
      // Should NOT have called invokeMethod — dispatch was direct
      expect(kernelFacet.calls.invokeMethod).toHaveLength(0);
    });

    it('returns error for unknown method on self-ref', async () => {
      const root = await setupRepl();
      const ref = root.issueRef('ko-self', true);
      const response = await sendRequest({ ref, method: 'nonexistent' });

      expect(response.ok).toBe(false);
      expect(response.error).toContain('Unknown method on root');
    });

    it('returns error for unknown command', async () => {
      await setupRepl();
      const response = await sendRequest({ method: 'bogus' });

      expect(response.ok).toBe(false);
      expect(response.error).toContain('Unknown command');
    });

    it('returns error for invalid JSON', async () => {
      await setupRepl();
      io.deliverLine('not json');
      await new Promise((resolve) => setTimeout(resolve, 50));

      const lastWrite = io.written[io.written.length - 1];
      const response = JSON.parse(lastWrite!) as { ok: boolean; error: string };
      expect(response.ok).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('returns error for non-object request', async () => {
      await setupRepl();
      const response = await sendRequest(42 as never);
      expect(response.ok).toBe(false);
      expect(response.error).toContain('Request must be a JSON object');
    });

    it('returns error for request missing method', async () => {
      await setupRepl();
      const response = await sendRequest({ ref: 'd-1' });
      expect(response.ok).toBe(false);
      expect(response.error).toContain(
        'Request must have a string "method" field',
      );
    });

    it('returns error for non-string ref', async () => {
      await setupRepl();
      const response = await sendRequest({ method: 'help', ref: 123 } as never);
      expect(response.ok).toBe(false);
      expect(response.error).toContain('"ref" must be a string');
    });

    it('returns error for non-array args', async () => {
      await setupRepl();
      const response = await sendRequest({
        method: 'help',
        args: 'not-array',
      } as never);
      expect(response.ok).toBe(false);
      expect(response.error).toContain('"args" must be an array');
    });

    it('continues after EOF (client disconnect)', async () => {
      await setupRepl();

      // Send a command
      const response1 = await sendRequest({ method: 'help' });
      expect(response1.ok).toBe(true);

      // Simulate disconnect
      io.deliverEOF();
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Send another command (new connection)
      const response2 = await sendRequest({ method: 'status' });
      expect(response2.ok).toBe(true);
    });
  });

  describe('privileged root object methods', () => {
    async function setupRoot() {
      const root = buildRootObject(
        {},
        { name: 'test-console' },
        baggage as never,
      );
      await root.bootstrap({}, { kernelFacet: kernelFacet.facet });
      return root;
    }

    it('returns help with all privileged commands', async () => {
      const root = await setupRoot();
      const result = root.help();
      expect(result.commands).toStrictEqual([
        'help - show available commands',
        'status - kernel status',
        'subclusters - list subclusters',
        'launch <config> - launch a subcluster',
        'terminate <subclusterId> - terminate a subcluster',
        'ls - list all issued refs',
        'revoke <ref> - revoke a ref',
        'invoke <ref> <method> [...args] - call a method on a ref',
      ]);
    });

    it('returns kernel status', async () => {
      const root = await setupRoot();
      const result = await root.status();

      expect(result).toStrictEqual({
        incarnation: 1,
        subclusters: 0,
        vats: 1,
        pendingMessages: 0,
      });
      expect(kernelFacet.calls.getStatus).toHaveLength(1);
    });

    it('returns subclusters list', async () => {
      const root = await setupRoot();
      const result = await root.subclusters();

      expect(result).toStrictEqual([]);
      expect(kernelFacet.calls.getSubclusters).toHaveLength(1);
    });

    it('launches subcluster and issues ref', async () => {
      const root = await setupRoot();
      const config = {
        bootstrap: 'test',
        vats: { test: { bundleSpec: 'test-bundle' } },
      };
      const result = await root.launch(config);

      expect(result.ref).toMatch(/^d-\d+$/u);
      expect(result.subclusterId).toBe('sub-1');
      expect(kernelFacet.calls.launchSubcluster).toHaveLength(1);
    });

    it('terminates subcluster', async () => {
      const root = await setupRoot();
      const result = await root.terminate('sub-1');

      expect(result).toStrictEqual({ ok: true });
      expect(kernelFacet.calls.terminateSubcluster).toHaveLength(1);
    });

    it('revokes a ref', async () => {
      const root = await setupRoot();
      root.issueRef('ko1');

      const result = root.revoke('d-1');
      expect(result).toStrictEqual({ ok: true });
    });

    it('returns false when revoking unknown ref', async () => {
      const root = await setupRoot();
      const result = root.revoke('d-999');
      expect(result).toStrictEqual({ ok: false });
    });

    it('lists issued refs', async () => {
      const root = await setupRoot();
      root.issueRef('ko1');
      root.issueRef('ko2');

      const result = root.ls();
      expect(result.refs).toHaveLength(2);
      expect(result.refs[0]).toMatch(/^d-\d+$/u);
      expect(result.refs[1]).toMatch(/^d-\d+$/u);
    });

    it('returns empty list when no refs issued', async () => {
      const root = await setupRoot();
      const result = root.ls();
      expect(result).toStrictEqual({ refs: [] });
    });

    it('throws when invoke target ref is unknown', async () => {
      const root = await setupRoot();
      await expect(root.invoke('d-999', 'transfer')).rejects.toThrow(
        'Unknown ref: d-999',
      );
    });

    it('throws when invoke is called without a target ref', async () => {
      const root = await setupRoot();
      await expect(root.invoke('', 'transfer')).rejects.toThrow(
        'invoke requires a target ref',
      );
    });

    it('throws when invoke is called without a method', async () => {
      const root = await setupRoot();
      const ref = root.issueRef('ko-wallet');
      await expect(root.invoke(ref, '')).rejects.toThrow(
        'invoke requires a method name',
      );
    });
  });

  describe('ref manager', () => {
    it('issues idempotent refs for the same kref', async () => {
      const root = buildRootObject(
        {},
        { name: 'test-console' },
        baggage as never,
      );
      await root.bootstrap({}, { kernelFacet: kernelFacet.facet });

      const ref1 = root.issueRef('ko1');
      const ref2 = root.issueRef('ko1');
      expect(ref1).toBe(ref2);
      expect(ref1).toMatch(/^d-\d+$/u);
    });

    it('issues different refs for different krefs', async () => {
      const root = buildRootObject(
        {},
        { name: 'test-console' },
        baggage as never,
      );
      await root.bootstrap({}, { kernelFacet: kernelFacet.facet });

      const ref1 = root.issueRef('ko1');
      const ref2 = root.issueRef('ko2');
      expect(ref1).not.toBe(ref2);
    });

    it('persists refs in baggage', async () => {
      const root = buildRootObject(
        {},
        { name: 'test-console' },
        baggage as never,
      );
      await root.bootstrap({}, { kernelFacet: kernelFacet.facet });

      root.issueRef('ko1');
      expect(baggage.has('refs')).toBe(true);
      expect(baggage.has('krefToRef')).toBe(true);
    });
  });
});
