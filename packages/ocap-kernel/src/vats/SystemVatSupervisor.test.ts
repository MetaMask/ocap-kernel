import type { VatDeliveryObject } from '@agoric/swingset-liveslots';
import { Logger } from '@metamask/logger';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MockInstance } from 'vitest';

import type { SystemVatBuildRootObject, SystemVatId } from '../types.ts';
import type { SystemVatExecuteSyscall } from './SystemVatSupervisor.ts';
import { SystemVatSupervisor } from './SystemVatSupervisor.ts';

// Mock liveslots
const mockDispatch = vi.fn();
vi.mock('@agoric/swingset-liveslots', () => ({
  makeLiveSlots: vi.fn(() => ({
    dispatch: mockDispatch,
  })),
}));

describe('SystemVatSupervisor', () => {
  let buildRootObject: SystemVatBuildRootObject;
  let vatPowers: Record<string, unknown>;
  let executeSyscall: SystemVatExecuteSyscall;
  let logger: Logger;
  const systemVatId: SystemVatId = 'sv0';

  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatch.mockResolvedValue(undefined);

    buildRootObject = vi.fn(() => ({
      test: () => 'test result',
    }));
    vatPowers = { testPower: 'power' };
    executeSyscall = vi.fn().mockReturnValue(['ok', null]);
    logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      subLogger: vi.fn(() => logger),
    } as unknown as Logger;
  });

  describe('constructor', () => {
    it('creates a SystemVatSupervisor with the given ID', () => {
      const supervisor = new SystemVatSupervisor({
        id: systemVatId,
        buildRootObject,
        vatPowers,
        parameters: undefined,
        executeSyscall,
        logger,
      });

      expect(supervisor.id).toBe(systemVatId);
    });

    it('initializes liveslots during construction', async () => {
      const { makeLiveSlots } = await import('@agoric/swingset-liveslots');

      const supervisor = new SystemVatSupervisor({
        id: systemVatId,
        buildRootObject,
        vatPowers,
        parameters: undefined,
        executeSyscall,
        logger,
      });

      expect(supervisor.id).toBe(systemVatId);
      expect(makeLiveSlots).toHaveBeenCalled();
    });

    it('passes vatPowers to liveslots', async () => {
      const { makeLiveSlots } = await import('@agoric/swingset-liveslots');

      const supervisor = new SystemVatSupervisor({
        id: systemVatId,
        buildRootObject,
        vatPowers: { customPower: 'custom' },
        parameters: undefined,
        executeSyscall,
        logger,
      });

      expect(supervisor.id).toBe(systemVatId);
      expect(makeLiveSlots).toHaveBeenCalledWith(
        expect.anything(),
        systemVatId,
        { customPower: 'custom' },
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('start', () => {
    it('dispatches startVat delivery', async () => {
      const supervisor = new SystemVatSupervisor({
        id: systemVatId,
        buildRootObject,
        vatPowers,
        parameters: undefined,
        executeSyscall,
        logger,
      });

      await supervisor.start();

      expect(mockDispatch).toHaveBeenCalledWith(
        expect.arrayContaining(['startVat', expect.anything()]),
      );
    });

    it('returns null on successful start', async () => {
      const supervisor = new SystemVatSupervisor({
        id: systemVatId,
        buildRootObject,
        vatPowers,
        parameters: undefined,
        executeSyscall,
        logger,
      });

      const result = await supervisor.start();

      expect(result).toBeNull();
    });

    it('returns error message on failed start', async () => {
      mockDispatch.mockRejectedValueOnce(new Error('start failed'));

      const supervisor = new SystemVatSupervisor({
        id: systemVatId,
        buildRootObject,
        vatPowers,
        parameters: undefined,
        executeSyscall,
        logger,
      });

      const result = await supervisor.start();

      expect(result).toBe('start failed');
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Start error'),
        'start failed',
      );
    });
  });

  describe('deliver', () => {
    it('dispatches message deliveries', async () => {
      const supervisor = new SystemVatSupervisor({
        id: systemVatId,
        buildRootObject,
        vatPowers,
        parameters: undefined,
        executeSyscall,
        logger,
      });

      const delivery: VatDeliveryObject = [
        'message',
        'o+0',
        { methargs: { body: '[]', slots: [] }, result: null },
      ];
      await supervisor.deliver(delivery);

      expect(mockDispatch).toHaveBeenCalledWith(delivery);
    });

    it('dispatches notify deliveries', async () => {
      const supervisor = new SystemVatSupervisor({
        id: systemVatId,
        buildRootObject,
        vatPowers,
        parameters: undefined,
        executeSyscall,
        logger,
      });

      const delivery: VatDeliveryObject = [
        'notify',
        [['p-1', false, { body: '"resolved"', slots: [] }]],
      ];
      await supervisor.deliver(delivery);

      expect(mockDispatch).toHaveBeenCalledWith(delivery);
    });

    it('returns null on successful delivery', async () => {
      const supervisor = new SystemVatSupervisor({
        id: systemVatId,
        buildRootObject,
        vatPowers,
        parameters: undefined,
        executeSyscall,
        logger,
      });

      const delivery: VatDeliveryObject = [
        'message',
        'o+0',
        { methargs: { body: '[]', slots: [] }, result: null },
      ];
      const result = await supervisor.deliver(delivery);

      expect(result).toBeNull();
    });

    it('returns error message on failed delivery', async () => {
      mockDispatch.mockRejectedValueOnce(new Error('delivery failed'));

      const supervisor = new SystemVatSupervisor({
        id: systemVatId,
        buildRootObject,
        vatPowers,
        parameters: undefined,
        executeSyscall,
        logger,
      });

      const delivery: VatDeliveryObject = [
        'message',
        'o+0',
        { methargs: { body: '[]', slots: [] }, result: null },
      ];
      const result = await supervisor.deliver(delivery);

      expect(result).toBe('delivery failed');
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Delivery error'),
        'delivery failed',
      );
    });
  });

  describe('syscall handling', () => {
    it('passes syscalls to executeSyscall callback', async () => {
      const { makeLiveSlots } = await import('@agoric/swingset-liveslots');

      const supervisor = new SystemVatSupervisor({
        id: systemVatId,
        buildRootObject,
        vatPowers,
        parameters: undefined,
        executeSyscall,
        logger,
      });
      expect(supervisor.id).toBe(systemVatId);

      // Get the syscall object passed to makeLiveSlots
      const syscall = (makeLiveSlots as unknown as MockInstance).mock
        .calls[0][0];

      // Test the send syscall
      syscall.send('o+1', { body: '[]', slots: [] }, 'p-1');

      expect(executeSyscall).toHaveBeenCalledWith([
        'send',
        'o+1',
        { methargs: { body: '[]', slots: [] }, result: 'p-1' },
      ]);
    });

    it('throws on syscall error', async () => {
      const { makeLiveSlots } = await import('@agoric/swingset-liveslots');

      const failingExecuteSyscall = vi
        .fn()
        .mockReturnValue(['error', 'syscall failed']);

      const supervisor = new SystemVatSupervisor({
        id: systemVatId,
        buildRootObject,
        vatPowers,
        parameters: undefined,
        executeSyscall: failingExecuteSyscall,
        logger,
      });
      expect(supervisor.id).toBe(systemVatId);

      // Get the syscall object passed to makeLiveSlots
      const syscall = (makeLiveSlots as unknown as MockInstance).mock
        .calls[0][0];

      expect(() =>
        syscall.send('o+1', { body: '[]', slots: [] }, 'p-1'),
      ).toThrow('syscall.send failed: syscall failed');
    });

    it('throws for callNow syscall', async () => {
      const { makeLiveSlots } = await import('@agoric/swingset-liveslots');

      const supervisor = new SystemVatSupervisor({
        id: systemVatId,
        buildRootObject,
        vatPowers,
        parameters: undefined,
        executeSyscall,
        logger,
      });
      expect(supervisor.id).toBe(systemVatId);

      // Get the syscall object passed to makeLiveSlots
      const syscall = (makeLiveSlots as unknown as MockInstance).mock
        .calls[0][0];

      expect(() => syscall.callNow()).toThrow(
        'callNow not supported for system vats',
      );
    });
  });

  describe('ephemeral vatstore', () => {
    it('provides ephemeral vatstore operations', async () => {
      const { makeLiveSlots } = await import('@agoric/swingset-liveslots');

      // eslint-disable-next-line no-new
      new SystemVatSupervisor({
        id: systemVatId,
        buildRootObject,
        vatPowers,
        parameters: undefined,
        executeSyscall,
        logger,
      });

      // Get the syscall object passed to makeLiveSlots
      const syscall = (makeLiveSlots as unknown as MockInstance).mock
        .calls[0][0];

      // Test vatstore operations
      expect(syscall.vatstoreGet('key')).toBeUndefined();

      syscall.vatstoreSet('key', 'value');
      expect(syscall.vatstoreGet('key')).toBe('value');

      syscall.vatstoreDelete('key');
      expect(syscall.vatstoreGet('key')).toBeUndefined();
    });

    it('provides getNextKey for ephemeral vatstore', async () => {
      const { makeLiveSlots } = await import('@agoric/swingset-liveslots');

      // eslint-disable-next-line no-new
      new SystemVatSupervisor({
        id: systemVatId,
        buildRootObject,
        vatPowers,
        parameters: undefined,
        executeSyscall,
        logger,
      });

      // Get the syscall object passed to makeLiveSlots
      const syscall = (makeLiveSlots as unknown as MockInstance).mock
        .calls[0][0];

      syscall.vatstoreSet('a', '1');
      syscall.vatstoreSet('b', '2');
      syscall.vatstoreSet('c', '3');

      expect(syscall.vatstoreGetNextKey('a')).toBe('b');
      expect(syscall.vatstoreGetNextKey('b')).toBe('c');
      expect(syscall.vatstoreGetNextKey('c')).toBeUndefined();
    });
  });

  describe('parameters', () => {
    it('passes parameters to buildRootObject', async () => {
      const { makeLiveSlots } = await import('@agoric/swingset-liveslots');

      // eslint-disable-next-line no-new
      new SystemVatSupervisor({
        id: systemVatId,
        buildRootObject,
        vatPowers,
        parameters: { testParam: 'testValue' },
        executeSyscall,
        logger,
      });

      // Get the buildVatNamespace function passed to makeLiveSlots
      const buildVatNamespace = (makeLiveSlots as unknown as MockInstance).mock
        .calls[0][6];

      // Call buildVatNamespace to get the namespace
      const namespace = await buildVatNamespace({}, {});

      // Call buildRootObject from the namespace
      (namespace.buildRootObject as CallableFunction)({});

      // Verify buildRootObject was called with parameters
      expect(buildRootObject).toHaveBeenCalledWith(expect.anything(), {
        testParam: 'testValue',
      });
    });
  });
});
