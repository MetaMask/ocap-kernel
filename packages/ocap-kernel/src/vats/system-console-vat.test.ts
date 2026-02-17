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
    launchSubcluster: [],
    terminateSubcluster: [],
  };

  const facet = makeDefaultExo('mockKernelFacet', {
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

  describe('REPL dispatch', () => {
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

    it('dispatches help command', async () => {
      await setupRepl();
      const response = await sendRequest({ method: 'help' });

      expect(response.ok).toBe(true);
      expect(response.result).toStrictEqual({
        commands: expect.arrayContaining([
          expect.stringContaining('help'),
          expect.stringContaining('status'),
        ]),
      });
    });

    it('dispatches status command', async () => {
      await setupRepl();
      const response = await sendRequest({ method: 'status' });

      expect(response.ok).toBe(true);
      expect(kernelFacet.calls.getStatus).toHaveLength(1);
    });

    it('dispatches subclusters command', async () => {
      await setupRepl();
      const response = await sendRequest({ method: 'subclusters' });

      expect(response.ok).toBe(true);
      expect(kernelFacet.calls.getSubclusters).toHaveLength(1);
    });

    it('dispatches launch command and issues ref', async () => {
      await setupRepl();
      const config = {
        bootstrap: 'test',
        vats: { test: { bundleSpec: 'test-bundle' } },
      };
      const response = await sendRequest({ method: 'launch', args: [config] });

      expect(response.ok).toBe(true);
      const result = response.result as { ref: string; subclusterId: string };
      expect(result.ref).toMatch(/^d-\d+$/u);
      expect(result.subclusterId).toBe('sub-1');
      expect(kernelFacet.calls.launchSubcluster).toHaveLength(1);
    });

    it('dispatches terminate command', async () => {
      await setupRepl();
      const response = await sendRequest({
        method: 'terminate',
        args: ['sub-1'],
      });

      expect(response.ok).toBe(true);
      expect(kernelFacet.calls.terminateSubcluster).toHaveLength(1);
    });

    it('dispatches revoke command', async () => {
      await setupRepl();

      // First launch to get a ref
      const launchResponse = await sendRequest({
        method: 'launch',
        args: [{ bootstrap: 'x', vats: { x: { bundleSpec: 'x' } } }],
      });
      const { ref } = launchResponse.result as { ref: string };

      // Revoke the ref
      const response = await sendRequest({ method: 'revoke', args: [ref] });
      expect(response).toStrictEqual({ ok: true, result: { ok: true } });
    });

    it('dispatches listRefs command', async () => {
      await setupRepl();

      // Launch to create a ref
      await sendRequest({
        method: 'launch',
        args: [{ bootstrap: 'x', vats: { x: { bundleSpec: 'x' } } }],
      });

      const response = await sendRequest({ method: 'listRefs' });
      expect(response.ok).toBe(true);
      const result = response.result as {
        refs: { ref: string; kref: string }[];
      };
      expect(result.refs).toHaveLength(1);
      expect(result.refs[0]!.kref).toBe('ko1');
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

    it('lists issued refs', async () => {
      const root = buildRootObject(
        {},
        { name: 'test-console' },
        baggage as never,
      );
      await root.bootstrap({}, { kernelFacet: kernelFacet.facet });

      const ref = root.issueRef('ko1');
      const refList = root.listRefs();
      expect(refList).toStrictEqual([{ ref, kref: 'ko1' }]);
    });
  });

  describe('help', () => {
    it('returns command list', () => {
      const root = buildRootObject(
        {},
        { name: 'test-console' },
        baggage as never,
      );
      const result = root.help();
      expect(result).toHaveProperty('commands');
      expect(result.commands.length).toBeGreaterThan(0);
    });
  });
});
