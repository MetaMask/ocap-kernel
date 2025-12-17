import { Logger } from '@metamask/logger';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { makeMapKernelDatabase } from '../../test/storage.ts';
import type { KernelQueue } from '../KernelQueue.ts';
import * as remoteComms from './remote-comms.ts';
import type { RemoteComms } from './types.ts';
import { makeKernelStore } from '../store/index.ts';
import type { PlatformServices } from '../types.ts';
import { RemoteManager } from './RemoteManager.ts';
import { createMockRemotesFactory } from '../../test/remotes-mocks.ts';

vi.mock('./remote-comms.ts', async () => {
  const actual = await vi.importActual('./remote-comms.ts');
  return {
    ...actual,
    initRemoteComms: vi.fn(),
  };
});

describe('RemoteManager', () => {
  let remoteManager: RemoteManager;
  let mockPlatformServices: PlatformServices;
  let kernelStore: ReturnType<typeof makeKernelStore>;
  let mockKernelQueue: KernelQueue;
  let logger: Logger;
  let mockRemoteComms: RemoteComms;
  let mockFactory: ReturnType<typeof createMockRemotesFactory>;

  beforeEach(() => {
    const kernelDatabase = makeMapKernelDatabase();
    kernelStore = makeKernelStore(kernelDatabase);
    logger = new Logger('test');

    mockFactory = createMockRemotesFactory({
      peerId: 'test-peer-id',
      kernelStore,
    });

    const mocks = mockFactory.makeRemoteManagerMocks();
    mockPlatformServices = mocks.platformServices;
    mockKernelQueue = mocks.kernelQueue;
    mockRemoteComms = mocks.remoteComms;

    remoteManager = new RemoteManager({
      platformServices: mockPlatformServices,
      kernelStore,
      kernelQueue: mockKernelQueue,
      logger,
    });

    vi.mocked(remoteComms.initRemoteComms).mockClear();
  });

  describe('initialization', () => {
    it('throws error if remote comms is accessed before initialization', () => {
      expect(() => remoteManager.getRemoteComms()).toThrow(
        'Remote comms not initialized',
      );
    });

    it('throws error if initRemoteComms is called without message handler', async () => {
      await expect(remoteManager.initRemoteComms()).rejects.toThrow(
        'Message handler must be set before initializing remote comms',
      );
    });

    it('initializes remote comms after setting message handler', async () => {
      const messageHandler = vi.fn();
      vi.mocked(remoteComms.initRemoteComms).mockResolvedValue(mockRemoteComms);

      remoteManager.setMessageHandler(messageHandler);
      await remoteManager.initRemoteComms({ relays: ['relay1', 'relay2'] });

      expect(remoteComms.initRemoteComms).toHaveBeenCalledWith(
        kernelStore,
        mockPlatformServices,
        messageHandler,
        { relays: ['relay1', 'relay2'] },
        logger,
        undefined,
        expect.any(Function),
      );
    });

    it('initializes remote comms with all options', async () => {
      const messageHandler = vi.fn();
      vi.mocked(remoteComms.initRemoteComms).mockResolvedValue(mockRemoteComms);

      remoteManager.setMessageHandler(messageHandler);
      await remoteManager.initRemoteComms({
        relays: ['relay1', 'relay2'],
        maxRetryAttempts: 5,
        maxQueue: 100,
      });

      expect(remoteComms.initRemoteComms).toHaveBeenCalledWith(
        kernelStore,
        mockPlatformServices,
        messageHandler,
        {
          relays: ['relay1', 'relay2'],
          maxRetryAttempts: 5,
          maxQueue: 100,
        },
        logger,
        undefined,
        expect.any(Function),
      );
    });

    it('passes keySeed to initRemoteComms', async () => {
      const keySeed = '0x1234567890abcdef';
      const managerWithKeySeed = new RemoteManager({
        platformServices: mockPlatformServices,
        kernelStore,
        kernelQueue: mockKernelQueue,
        logger,
        keySeed,
      });

      const messageHandler = vi.fn();
      vi.mocked(remoteComms.initRemoteComms).mockResolvedValue(mockRemoteComms);

      managerWithKeySeed.setMessageHandler(messageHandler);
      await managerWithKeySeed.initRemoteComms();

      expect(remoteComms.initRemoteComms).toHaveBeenCalledWith(
        kernelStore,
        mockPlatformServices,
        messageHandler,
        {},
        logger,
        keySeed,
        expect.any(Function),
      );
    });

    it('correctly reports remote comms initialization status', async () => {
      expect(remoteManager.isRemoteCommsInitialized()).toBe(false);

      const messageHandler = vi.fn();
      vi.mocked(remoteComms.initRemoteComms).mockResolvedValue(mockRemoteComms);

      remoteManager.setMessageHandler(messageHandler);
      await remoteManager.initRemoteComms();

      expect(remoteManager.isRemoteCommsInitialized()).toBe(true);
    });

    it('restores previously established remotes from kernel store', async () => {
      // First establish some remotes and store them
      const messageHandler = vi.fn();
      vi.mocked(remoteComms.initRemoteComms).mockResolvedValue(mockRemoteComms);
      remoteManager.setMessageHandler(messageHandler);
      await remoteManager.initRemoteComms();

      const remote1 = remoteManager.establishRemote('peer-1', ['relay-1']);
      const remote2 = remoteManager.establishRemote('peer-2', ['relay-2']);
      const remote1Id = remote1.remoteId;
      const remote2Id = remote2.remoteId;

      // Stop remote comms (simulating shutdown)
      await mockPlatformServices.stopRemoteComms();
      remoteManager.cleanup();

      // Create a new RemoteManager instance (simulating restart)
      const newRemoteManager = new RemoteManager({
        platformServices: mockPlatformServices,
        kernelStore, // Same store with persisted remotes
        kernelQueue: mockKernelQueue,
        logger,
      });

      // Initialize - should restore the remotes
      newRemoteManager.setMessageHandler(messageHandler);
      await newRemoteManager.initRemoteComms();

      // Verify remotes were restored
      const restoredRemote1 = newRemoteManager.getRemote(remote1Id);
      const restoredRemote2 = newRemoteManager.getRemote(remote2Id);

      expect(restoredRemote1).toBeDefined();
      expect(restoredRemote2).toBeDefined();
      expect(restoredRemote1.remoteId).toBe(remote1Id);
      expect(restoredRemote2.remoteId).toBe(remote2Id);

      // Verify remotes are also accessible by peer ID
      expect(newRemoteManager.remoteFor('peer-1')).toBe(restoredRemote1);
      expect(newRemoteManager.remoteFor('peer-2')).toBe(restoredRemote2);
    });

    it('handles empty kernel store during initialization', async () => {
      const messageHandler = vi.fn();
      vi.mocked(remoteComms.initRemoteComms).mockResolvedValue(mockRemoteComms);

      remoteManager.setMessageHandler(messageHandler);
      await remoteManager.initRemoteComms();

      // Should initialize successfully with no remotes
      expect(remoteManager.isRemoteCommsInitialized()).toBe(true);
    });
  });

  describe('remote comms operations', () => {
    beforeEach(async () => {
      const messageHandler = vi.fn();
      vi.mocked(remoteComms.initRemoteComms).mockResolvedValue(mockRemoteComms);
      remoteManager.setMessageHandler(messageHandler);
      await remoteManager.initRemoteComms();
    });

    it('gets peer ID from remote comms', () => {
      const peerId = remoteManager.getPeerId();
      expect(peerId).toBe('test-peer-id');
      expect(mockRemoteComms.getPeerId).toHaveBeenCalled();
    });

    it('sends remote message', async () => {
      await remoteManager.sendRemoteMessage('peer123', 'test message');
      expect(mockRemoteComms.sendRemoteMessage).toHaveBeenCalledWith(
        'peer123',
        'test message',
      );
    });

    it('closes connection to peer', async () => {
      await remoteManager.closeConnection('peer123');
      expect(mockPlatformServices.closeConnection).toHaveBeenCalledWith(
        'peer123',
      );
    });

    it('closes connection to peer that does not exist', async () => {
      await remoteManager.closeConnection('non-existent-peer');
      expect(mockPlatformServices.closeConnection).toHaveBeenCalledWith(
        'non-existent-peer',
      );
    });

    it('registers location hints', async () => {
      await remoteManager.registerLocationHints('peer123', ['hint1', 'hint2']);
      expect(mockRemoteComms.registerLocationHints).toHaveBeenCalledWith(
        'peer123',
        ['hint1', 'hint2'],
      );
    });

    it('reconnects peer with hints', async () => {
      await remoteManager.reconnectPeer('peer123', ['relay1', 'relay2']);
      expect(mockPlatformServices.reconnectPeer).toHaveBeenCalledWith(
        'peer123',
        ['relay1', 'relay2'],
      );
    });

    it('reconnects peer with empty hints when hints not provided', async () => {
      await remoteManager.reconnectPeer('peer123');
      expect(mockPlatformServices.reconnectPeer).toHaveBeenCalledWith(
        'peer123',
        [],
      );
    });

    it('gets remote comms after initialization', () => {
      const comms = remoteManager.getRemoteComms();
      expect(comms).toBe(mockRemoteComms);
    });
  });

  describe('remote handle management', () => {
    beforeEach(async () => {
      const messageHandler = vi.fn();
      vi.mocked(remoteComms.initRemoteComms).mockResolvedValue(mockRemoteComms);
      remoteManager.setMessageHandler(messageHandler);
      await remoteManager.initRemoteComms();
    });

    it('establishes a new remote connection', () => {
      const remote = remoteManager.establishRemote('peer123');
      expect(remote).toBeDefined();
      expect(remote.remoteId).toMatch(/^r\d+$/u);
    });

    it('establishes a new remote with location hints', () => {
      const hints = ['/dns4/relay1.example/tcp/443/wss/p2p/relay1'];
      const remote = remoteManager.establishRemote('peer-with-hints', hints);

      expect(remote).toBeDefined();
      expect(remote.remoteId).toMatch(/^r\d+$/u);

      // Verify hints are persisted in kernel store
      const storedInfo = kernelStore.getRemoteInfo(remote.remoteId);
      expect(storedInfo).toBeDefined();
      expect(storedInfo?.hints).toStrictEqual(hints);
    });

    it('stores and retrieves multiple location hints', () => {
      const hints = [
        '/dns4/relay1.example/tcp/443/wss/p2p/relay1',
        '/dns4/relay2.example/tcp/443/wss/p2p/relay2',
        '/dns4/relay3.example/tcp/443/wss/p2p/relay3',
      ];
      const remote = remoteManager.establishRemote('peer-multi-hints', hints);

      const storedInfo = kernelStore.getRemoteInfo(remote.remoteId);
      expect(storedInfo?.hints).toStrictEqual(hints);
      expect(storedInfo?.hints).toHaveLength(3);
    });

    it('reuses existing remote for same peer', () => {
      const remote1 = remoteManager.establishRemote('peer123');
      const remote2 = remoteManager.remoteFor('peer123');
      expect(remote1).toBe(remote2);
    });

    it('creates new remote if not exists', () => {
      const remote = remoteManager.remoteFor('new-peer');
      expect(remote).toBeDefined();
      expect(remote.remoteId).toMatch(/^r\d+$/u);
    });

    it('creates new remote with hints using remoteFor', () => {
      const hints = ['/dns4/relay.example/tcp/443/wss/p2p/relay'];
      const remote = remoteManager.remoteFor('new-peer-hints', hints);

      expect(remote).toBeDefined();
      const storedInfo = kernelStore.getRemoteInfo(remote.remoteId);
      expect(storedInfo?.hints).toStrictEqual(hints);
    });

    it('gets remote by ID', () => {
      const established = remoteManager.establishRemote('peer123');
      const retrieved = remoteManager.getRemote(established.remoteId);
      expect(retrieved).toBe(established);
    });

    it('throws error when getting non-existent remote by ID', () => {
      expect(() => remoteManager.getRemote('r999')).toThrow(
        'Remote not found: r999',
      );
    });

    it('handles remote message', async () => {
      const mockHandleMessage = vi.fn().mockResolvedValue('response');
      const remote = remoteManager.establishRemote('peer123');
      remote.handleRemoteMessage = mockHandleMessage;

      const response = await remoteManager.handleRemoteMessage(
        'peer123',
        'test message',
      );
      expect(response).toBe('response');
      expect(mockHandleMessage).toHaveBeenCalledWith('test message');
    });

    it('creates new remote when handling message from unknown peer', async () => {
      const message = JSON.stringify({
        method: 'deliver',
        params: [
          'message',
          'ko1',
          { type: 'invoke', target: 'ko2', methargs: {} },
        ],
      });

      // This will create a new remote and try to handle the message
      // We expect it to fail because the remote doesn't have the necessary setup
      await expect(
        remoteManager.handleRemoteMessage('new-peer', message),
      ).rejects.toThrow('ko1 is not an ERef');

      // But verify that a new remote was created
      const remote = remoteManager.remoteFor('new-peer');
      expect(remote).toBeDefined();
    });

    it('preserves location hints across stop/restart cycle', async () => {
      const hints = ['/dns4/relay.example/tcp/443/wss/p2p/relay'];
      const remote = remoteManager.establishRemote('peer-persist-hints', hints);
      const { remoteId } = remote;

      // Stop and restart
      await mockPlatformServices.stopRemoteComms();
      remoteManager.cleanup();

      const messageHandler = vi.fn();
      vi.mocked(remoteComms.initRemoteComms).mockResolvedValue(mockRemoteComms);
      remoteManager.setMessageHandler(messageHandler);
      await remoteManager.initRemoteComms();

      // Verify hints were restored
      const restoredRemote = remoteManager.getRemote(remoteId);
      const storedInfo = kernelStore.getRemoteInfo(restoredRemote.remoteId);
      expect(storedInfo?.hints).toStrictEqual(hints);
    });
  });

  describe('message handler', () => {
    it('sets message handler', () => {
      const handler = vi.fn();
      // Should not throw
      expect(() => remoteManager.setMessageHandler(handler)).not.toThrow();
    });

    it('allows setting message handler multiple times', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      remoteManager.setMessageHandler(handler1);
      remoteManager.setMessageHandler(handler2);

      // Should not throw
      expect(() => remoteManager.setMessageHandler(handler2)).not.toThrow();
    });
  });

  describe('cleanup', () => {
    beforeEach(async () => {
      const messageHandler = vi.fn();
      vi.mocked(remoteComms.initRemoteComms).mockResolvedValue(mockRemoteComms);
      remoteManager.setMessageHandler(messageHandler);
      await remoteManager.initRemoteComms();
    });

    it('clears remoteComms after cleanup', () => {
      remoteManager.cleanup();

      expect(remoteManager.isRemoteCommsInitialized()).toBe(false);
    });

    it('clears all remote handles after cleanup', () => {
      // Establish some remotes
      remoteManager.establishRemote('peer1');
      remoteManager.establishRemote('peer2');
      remoteManager.establishRemote('peer3');

      // Verify they exist
      expect(remoteManager.remoteFor('peer1')).toBeDefined();
      expect(remoteManager.remoteFor('peer2')).toBeDefined();
      expect(remoteManager.remoteFor('peer3')).toBeDefined();

      remoteManager.cleanup();

      // After cleanup, trying to get remotes should throw or create new ones
      expect(remoteManager.isRemoteCommsInitialized()).toBe(false);
    });

    it('throws when calling getPeerId after cleanup', () => {
      remoteManager.cleanup();

      expect(() => remoteManager.getPeerId()).toThrow(
        'Remote comms not initialized',
      );
    });

    it('throws when calling sendRemoteMessage after cleanup', async () => {
      remoteManager.cleanup();

      await expect(
        remoteManager.sendRemoteMessage('peer1', 'test'),
      ).rejects.toThrow('Remote comms not initialized');
    });

    it('throws when calling closeConnection after cleanup', async () => {
      remoteManager.cleanup();

      await expect(remoteManager.closeConnection('peer1')).rejects.toThrow(
        'Remote comms not initialized',
      );
    });

    it('throws when calling registerLocationHints after cleanup', async () => {
      remoteManager.cleanup();

      await expect(
        remoteManager.registerLocationHints('peer1', ['hint1', 'hint2']),
      ).rejects.toThrow('Remote comms not initialized');
    });

    it('throws when calling reconnectPeer after cleanup', async () => {
      remoteManager.cleanup();

      await expect(remoteManager.reconnectPeer('peer1')).rejects.toThrow(
        'Remote comms not initialized',
      );
    });

    it('can be called when remote comms is not initialized', () => {
      const newManager = new RemoteManager({
        platformServices: mockPlatformServices,
        kernelStore,
        kernelQueue: mockKernelQueue,
        logger,
      });

      // Should not throw
      expect(() => newManager.cleanup()).not.toThrow();
    });

    it('allows re-initialization after cleanup', async () => {
      remoteManager.cleanup();

      // Should be able to initialize again
      const messageHandler = vi.fn();
      vi.mocked(remoteComms.initRemoteComms).mockResolvedValue(mockRemoteComms);
      remoteManager.setMessageHandler(messageHandler);
      await remoteManager.initRemoteComms({ relays: ['relay1'] });

      expect(remoteManager.isRemoteCommsInitialized()).toBe(true);
      expect(remoteComms.initRemoteComms).toHaveBeenCalledTimes(2);
    });

    it('clears remote handles by peer ID', () => {
      const remote1 = remoteManager.establishRemote('peer1');
      const remote2 = remoteManager.establishRemote('peer2');

      // Verify they're accessible
      expect(remoteManager.remoteFor('peer1')).toBe(remote1);
      expect(remoteManager.remoteFor('peer2')).toBe(remote2);

      remoteManager.cleanup();

      // After cleanup, remotes are cleared
      expect(remoteManager.isRemoteCommsInitialized()).toBe(false);
    });
  });

  describe('handleRemoteGiveUp', () => {
    beforeEach(async () => {
      const messageHandler = vi.fn();
      vi.mocked(remoteComms.initRemoteComms).mockResolvedValue(mockRemoteComms);
      remoteManager.setMessageHandler(messageHandler);
      await remoteManager.initRemoteComms();
    });

    it('handles remote give up callback when remote exists', () => {
      const peerId = 'peer-to-give-up';
      const remote = remoteManager.establishRemote(peerId);
      const rejectPendingRedemptionsSpy = vi.spyOn(
        remote,
        'rejectPendingRedemptions',
      );
      // Get the callback that was passed to initRemoteComms
      const initCall = vi.mocked(remoteComms.initRemoteComms).mock.calls[0];
      const onRemoteGiveUp = initCall?.[6] as (peerId: string) => void;
      onRemoteGiveUp(peerId);
      // Verify pending redemptions were rejected
      expect(rejectPendingRedemptionsSpy).toHaveBeenCalledWith(
        `Remote connection lost: ${peerId} (max retries reached or non-retryable error)`,
      );
    });

    it('handles remote give up callback when remote does not exist', () => {
      const peerId = 'non-existent-peer';
      const initCall = vi.mocked(remoteComms.initRemoteComms).mock.calls[0];
      const onRemoteGiveUp = initCall?.[6] as (peerId: string) => void;
      expect(() => onRemoteGiveUp(peerId)).not.toThrow();
    });

    it('handles remote give up and processes promises when they exist', () => {
      const peerId = 'peer-with-promises';
      remoteManager.establishRemote(peerId);
      const initCall = vi.mocked(remoteComms.initRemoteComms).mock.calls[0];
      const onRemoteGiveUp = initCall?.[6] as (peerId: string) => void;
      expect(() => onRemoteGiveUp(peerId)).not.toThrow();
    });

    it('handles remote give up with no promises', () => {
      const peerId = 'peer-with-no-promises';
      remoteManager.establishRemote(peerId);
      const resolvePromisesSpy = vi.spyOn(mockKernelQueue, 'resolvePromises');
      const initCall = vi.mocked(remoteComms.initRemoteComms).mock.calls[0];
      const onRemoteGiveUp = initCall?.[6] as (peerId: string) => void;
      onRemoteGiveUp(peerId);
      expect(resolvePromisesSpy).not.toHaveBeenCalled();
    });
  });
});
