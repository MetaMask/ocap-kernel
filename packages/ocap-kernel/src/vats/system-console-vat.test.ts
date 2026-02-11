import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import { describe, it, expect } from 'vitest';

import { buildRootObject } from './system-console-vat.ts';

type MockBaggage = {
  has: (key: string) => boolean;
  get: (key: string) => unknown;
  init: (key: string, value: unknown) => void;
  set: (key: string, value: unknown) => void;
};

function makeMockBaggage(): MockBaggage {
  const store = new Map<string, unknown>();
  return {
    has: (key: string) => store.has(key),
    get: (key: string) => store.get(key),
    init: (key: string, value: unknown) => {
      if (store.has(key)) {
        throw Error(`key already exists: ${key}`);
      }
      store.set(key, value);
    },
    set: (key: string, value: unknown) => {
      store.set(key, value);
    },
  };
}

function makeMockKernelFacet() {
  let lastLaunchConfig: unknown;
  let lastTerminateId: string | undefined;

  const exo = makeDefaultExo('mockKernelFacet', {
    async getStatus() {
      return { initialized: true, running: true, vatCount: 3 };
    },
    async getSubclusters() {
      return [];
    },
    async launchSubcluster(config: unknown) {
      lastLaunchConfig = config;
      return { subclusterId: 'sc-1', rootKref: 'ko5' };
    },
    async terminateSubcluster(subclusterId: string) {
      lastTerminateId = subclusterId;
    },
    async queueMessage() {
      return { body: '"ok"', slots: [] };
    },
  });

  return {
    exo,
    getLastLaunchConfig: () => lastLaunchConfig,
    getLastTerminateId: () => lastTerminateId,
  };
}

function makeMockRemotable(
  name: string,
  methods: Record<string, (...args: unknown[]) => unknown>,
) {
  return makeDefaultExo(name, methods);
}

describe('system-console-vat', () => {
  describe('buildRootObject', () => {
    it('creates root object with both console and system methods', () => {
      const baggage = makeMockBaggage();
      const root = buildRootObject(undefined, {}, baggage);
      expect(typeof root.help).toBe('function');
      expect(typeof root.ls).toBe('function');
      expect(typeof root.inspect).toBe('function');
      expect(typeof root.invoke).toBe('function');
      expect(typeof root.name).toBe('function');
      expect(typeof root.launch).toBe('function');
      expect(typeof root.terminate).toBe('function');
      expect(typeof root.status).toBe('function');
      expect(typeof root.revoke).toBe('function');
    });
  });

  describe('bootstrap', () => {
    it('stores kernelFacet from services', async () => {
      const baggage = makeMockBaggage();
      const root = buildRootObject(undefined, {}, baggage);
      const { exo } = makeMockKernelFacet();
      await root.bootstrap(undefined, { kernelFacet: exo });
      expect(baggage.get('kernelFacet')).toBe(exo);
    });

    it('restores kernelFacet from baggage on rebuild', async () => {
      const baggage = makeMockBaggage();
      const { exo } = makeMockKernelFacet();
      baggage.init('kernelFacet', exo);

      const root = buildRootObject(undefined, {}, baggage);
      const result = await root.status();
      expect(result).toStrictEqual({
        initialized: true,
        running: true,
        vatCount: 3,
      });
    });
  });

  describe('help', () => {
    it('includes system commands', () => {
      const baggage = makeMockBaggage();
      const root = buildRootObject(undefined, {}, baggage);
      const result = root.help();
      const names = result.commands.map((cmd: { name: string }) => cmd.name);
      expect(names).toContain('launch');
      expect(names).toContain('terminate');
      expect(names).toContain('status');
      expect(names).toContain('revoke');
    });
  });

  describe('status', () => {
    it('returns kernel status via kernelFacet', async () => {
      const baggage = makeMockBaggage();
      const root = buildRootObject(undefined, {}, baggage);
      const { exo } = makeMockKernelFacet();
      await root.bootstrap(undefined, { kernelFacet: exo });

      const result = await root.status();
      expect(result).toStrictEqual({
        initialized: true,
        running: true,
        vatCount: 3,
      });
    });

    it('returns error when kernelFacet not available', async () => {
      const baggage = makeMockBaggage();
      const root = buildRootObject(undefined, {}, baggage);
      const result = await root.status();
      expect(result).toStrictEqual({ error: 'kernel facet not available' });
    });
  });

  describe('launch', () => {
    it('launches a subcluster via kernelFacet', async () => {
      const baggage = makeMockBaggage();
      const root = buildRootObject(undefined, {}, baggage);
      const mock = makeMockKernelFacet();
      await root.bootstrap(undefined, { kernelFacet: mock.exo });

      const config = {
        bootstrap: 'main',
        vats: {
          main: { sourceSpec: 'test-bundle' },
        },
      };
      const result = await root.launch(config);
      expect(mock.getLastLaunchConfig()).toStrictEqual(config);
      expect(result).toStrictEqual({ subclusterId: 'sc-1' });
    });
  });

  describe('terminate', () => {
    it('terminates a subcluster via kernelFacet', async () => {
      const baggage = makeMockBaggage();
      const root = buildRootObject(undefined, {}, baggage);
      const mock = makeMockKernelFacet();
      await root.bootstrap(undefined, { kernelFacet: mock.exo });

      const result = await root.terminate('sc-1');
      expect(mock.getLastTerminateId()).toBe('sc-1');
      expect(result).toStrictEqual({ terminated: 'sc-1' });
    });
  });

  describe('revoke', () => {
    it('revokes the system console', () => {
      const baggage = makeMockBaggage();
      const root = buildRootObject(undefined, {}, baggage);
      const result = root.revoke();
      expect(result).toStrictEqual({ revoked: true });
      expect(baggage.get('revoked')).toBe(true);
    });

    it('prevents all operations after revocation', async () => {
      const baggage = makeMockBaggage();
      const root = buildRootObject(undefined, {}, baggage);
      const { exo } = makeMockKernelFacet();
      await root.bootstrap(undefined, { kernelFacet: exo });

      root.revoke();

      expect(() => root.help()).toThrow('system console has been revoked');
      expect(() => root.ls()).toThrow('system console has been revoked');
      await expect(root.status()).rejects.toThrow(
        'system console has been revoked',
      );
      await expect(root.launch({} as never)).rejects.toThrow(
        'system console has been revoked',
      );
      expect(() => root.receive('cap')).toThrow(
        'system console has been revoked',
      );
    });

    it('persists revocation across restarts', () => {
      const baggage = makeMockBaggage();
      const root1 = buildRootObject(undefined, {}, baggage);
      root1.revoke();

      const root2 = buildRootObject(undefined, {}, baggage);
      expect(() => root2.help()).toThrow('system console has been revoked');
    });

    it('clears the namespace on revocation', () => {
      const baggage = makeMockBaggage();
      const root = buildRootObject(undefined, {}, baggage);
      root.receive('cap1');
      root.receive('cap2');
      expect(root.ls().entries).toHaveLength(2);

      root.revoke();

      const ns = baggage.get('namespace') as Map<string, unknown>;
      expect(ns.size).toBe(0);
    });
  });

  describe('console commands (inherited behavior)', () => {
    it('receives capabilities and assigns cattle names', () => {
      const baggage = makeMockBaggage();
      const root = buildRootObject(undefined, {}, baggage);
      expect(root.receive('cap1')).toBe('o0000');
      expect(root.receive('cap2')).toBe('o0001');
    });

    it('assigns pet names', () => {
      const baggage = makeMockBaggage();
      const root = buildRootObject(undefined, {}, baggage);
      root.receive('cap1');
      expect(root.name('o0000', 'wallet')).toStrictEqual({
        named: 'o0000',
        as: 'wallet',
      });
    });

    it('invokes methods on held capabilities', async () => {
      const baggage = makeMockBaggage();
      const root = buildRootObject(undefined, {}, baggage);
      const remotable = makeMockRemotable('pingable', {
        ping: () => 'pong',
      });
      root.receive(remotable);
      const result = await root.invoke('o0000', 'ping');
      expect(result).toBe('pong');
    });
  });
});
