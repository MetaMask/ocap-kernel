import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import { describe, it, expect } from 'vitest';

import { buildRootObject } from './console-vat.ts';

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

function makeMockRemotable(
  name: string,
  methods: Record<string, (...args: unknown[]) => unknown>,
) {
  return makeDefaultExo(name, methods);
}

describe('console-vat', () => {
  describe('buildRootObject', () => {
    it('creates root object with expected methods', () => {
      const baggage = makeMockBaggage();
      const root = buildRootObject(undefined, {}, baggage);
      expect(typeof root.help).toBe('function');
      expect(typeof root.ls).toBe('function');
      expect(typeof root.inspect).toBe('function');
      expect(typeof root.invoke).toBe('function');
      expect(typeof root.name).toBe('function');
      expect(typeof root.receive).toBe('function');
    });
  });

  describe('help', () => {
    it('returns list of available commands', () => {
      const baggage = makeMockBaggage();
      const root = buildRootObject(undefined, {}, baggage);
      const result = root.help();
      expect(result.commands).toBeInstanceOf(Array);
      expect(result.commands.length).toBeGreaterThan(0);
      const names = result.commands.map((cmd: { name: string }) => cmd.name);
      expect(names).toContain('help');
      expect(names).toContain('ls');
      expect(names).toContain('inspect');
      expect(names).toContain('invoke');
      expect(names).toContain('name');
    });
  });

  describe('ls', () => {
    it('returns empty entries for new console', () => {
      const baggage = makeMockBaggage();
      const root = buildRootObject(undefined, {}, baggage);
      expect(root.ls()).toStrictEqual({ entries: [] });
    });

    it('lists received capabilities with cattle names', () => {
      const baggage = makeMockBaggage();
      const root = buildRootObject(undefined, {}, baggage);
      root.receive({ something: true });
      root.receive({ other: true });
      const result = root.ls();
      expect(result.entries).toStrictEqual([
        { name: 'o0000' },
        { name: 'o0001' },
      ]);
    });
  });

  describe('receive', () => {
    it('assigns cattle names starting from o0000', () => {
      const baggage = makeMockBaggage();
      const root = buildRootObject(undefined, {}, baggage);
      expect(root.receive('cap1')).toBe('o0000');
      expect(root.receive('cap2')).toBe('o0001');
      expect(root.receive('cap3')).toBe('o0002');
    });

    it('persists counter and namespace to baggage', () => {
      const baggage = makeMockBaggage();
      const root = buildRootObject(undefined, {}, baggage);
      root.receive('cap1');
      expect(baggage.get('counter')).toBe(1);
      expect(baggage.get('namespace')).toBeDefined();
    });
  });

  describe('name', () => {
    it('assigns a pet name to a cattle-named reference', () => {
      const baggage = makeMockBaggage();
      const root = buildRootObject(undefined, {}, baggage);
      root.receive('myCapability');
      const result = root.name('o0000', 'wallet');
      expect(result).toStrictEqual({ named: 'o0000', as: 'wallet' });
    });

    it('makes references discoverable by pet name via ls', () => {
      const baggage = makeMockBaggage();
      const root = buildRootObject(undefined, {}, baggage);
      root.receive('myCapability');
      root.name('o0000', 'wallet');
      expect(root.ls()).toStrictEqual({
        entries: [{ name: 'o0000', petName: 'wallet' }],
      });
    });

    it('returns error for unknown reference', () => {
      const baggage = makeMockBaggage();
      const root = buildRootObject(undefined, {}, baggage);
      const result = root.name('o9999', 'wallet');
      expect(result).toStrictEqual({ error: 'unknown reference: o9999' });
    });
  });

  describe('invoke', () => {
    it('invokes a method on a held capability and returns data', async () => {
      const baggage = makeMockBaggage();
      const root = buildRootObject(undefined, {}, baggage);
      const remotable = makeMockRemotable('pingable', {
        ping: () => 'pong',
      });
      root.receive(remotable);
      const result = await root.invoke('o0000', 'ping');
      expect(result).toBe('pong');
    });

    it('looks up by pet name', async () => {
      const baggage = makeMockBaggage();
      const root = buildRootObject(undefined, {}, baggage);
      const remotable = makeMockRemotable('pingable', {
        ping: () => 'pong',
      });
      root.receive(remotable);
      root.name('o0000', 'myService');
      const result = await root.invoke('myService', 'ping');
      expect(result).toBe('pong');
    });

    it('returns error for unknown reference', async () => {
      const baggage = makeMockBaggage();
      const root = buildRootObject(undefined, {}, baggage);
      const result = await root.invoke('o9999', 'ping');
      expect(result).toStrictEqual({ error: 'unknown reference: o9999' });
    });

    it('stores capability results and returns cattle name', async () => {
      const baggage = makeMockBaggage();
      const root = buildRootObject(undefined, {}, baggage);
      const child = makeMockRemotable('child', { hello: () => 'world' });
      const parent = makeMockRemotable('parent', {
        getChild: () => child,
      });
      root.receive(parent);
      const result = await root.invoke('o0000', 'getChild');
      expect(result).toStrictEqual({ storedAs: 'o0001' });
    });

    it('returns plain objects as data', async () => {
      const baggage = makeMockBaggage();
      const root = buildRootObject(undefined, {}, baggage);
      const remotable = makeMockRemotable('dataSource', {
        getData: () => ({ count: 42, label: 'test' }),
      });
      root.receive(remotable);
      const result = await root.invoke('o0000', 'getData');
      expect(result).toStrictEqual({ count: 42, label: 'test' });
    });
  });

  describe('inspect', () => {
    it('returns method names for remotable without describe', async () => {
      const baggage = makeMockBaggage();
      const root = buildRootObject(undefined, {}, baggage);
      const remotable = makeMockRemotable('inspectable', {
        foo: () => 'bar',
        baz: () => 'qux',
      });
      root.receive(remotable);
      const result = (await root.inspect('o0000')) as {
        ref: string;
        methods: string[];
      };
      expect(result.ref).toBe('o0000');
      expect(result.methods).toContain('foo');
      expect(result.methods).toContain('baz');
    });

    it('returns error for unknown reference', async () => {
      const baggage = makeMockBaggage();
      const root = buildRootObject(undefined, {}, baggage);
      const result = await root.inspect('o9999');
      expect(result).toStrictEqual({ error: 'unknown reference: o9999' });
    });
  });

  describe('persistence', () => {
    it('restores namespace and counter from baggage', () => {
      const baggage = makeMockBaggage();
      // First session: create some entries
      const root1 = buildRootObject(undefined, {}, baggage);
      root1.receive('cap1');
      root1.receive('cap2');
      root1.name('o0000', 'wallet');

      // Second session: restore from same baggage
      const root2 = buildRootObject(undefined, {}, baggage);
      expect(root2.ls()).toStrictEqual({
        entries: [{ name: 'o0000', petName: 'wallet' }, { name: 'o0001' }],
      });
      // Counter should continue from where it left off
      expect(root2.receive('cap3')).toBe('o0002');
    });
  });
});
