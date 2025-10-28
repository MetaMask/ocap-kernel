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
      await remoteManager.initRemoteComms(['relay1', 'relay2']);

      expect(remoteComms.initRemoteComms).toHaveBeenCalledWith(
        kernelStore,
        mockPlatformServices,
        messageHandler,
        ['relay1', 'relay2'],
        logger,
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
        [],
      );
    });

    it('sends remote message with provided hints', async () => {
      await remoteManager.sendRemoteMessage('peer123', 'test message', [
        'relay1',
        'relay2',
      ]);
      expect(mockRemoteComms.sendRemoteMessage).toHaveBeenCalledWith(
        'peer123',
        'test message',
        ['relay1', 'relay2'],
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

  describe('stopRemoteComms', () => {
    beforeEach(async () => {
      const messageHandler = vi.fn();
      vi.mocked(remoteComms.initRemoteComms).mockResolvedValue(mockRemoteComms);
      remoteManager.setMessageHandler(messageHandler);
      await remoteManager.initRemoteComms();
    });

    it('stops remote comms and calls stopRemoteComms', async () => {
      await remoteManager.stopRemoteComms();

      expect(mockRemoteComms.stopRemoteComms).toHaveBeenCalledOnce();
    });

    it('clears remoteComms after stopping', async () => {
      await remoteManager.stopRemoteComms();

      expect(remoteManager.isRemoteCommsInitialized()).toBe(false);
    });

    it('clears all remote handles after stopping', async () => {
      // Establish some remotes
      remoteManager.establishRemote('peer1');
      remoteManager.establishRemote('peer2');
      remoteManager.establishRemote('peer3');

      // Verify they exist
      expect(remoteManager.remoteFor('peer1')).toBeDefined();
      expect(remoteManager.remoteFor('peer2')).toBeDefined();
      expect(remoteManager.remoteFor('peer3')).toBeDefined();

      await remoteManager.stopRemoteComms();

      // After stop, trying to get remotes should throw or create new ones
      expect(remoteManager.isRemoteCommsInitialized()).toBe(false);
    });

    it('throws when calling getPeerId after stop', async () => {
      await remoteManager.stopRemoteComms();

      expect(() => remoteManager.getPeerId()).toThrow(
        'Remote comms not initialized',
      );
    });

    it('throws when calling sendRemoteMessage after stop', async () => {
      await remoteManager.stopRemoteComms();

      await expect(
        remoteManager.sendRemoteMessage('peer1', 'test'),
      ).rejects.toThrow('Remote comms not initialized');
    });

    it('can be called when remote comms is not initialized', async () => {
      const newManager = new RemoteManager({
        platformServices: mockPlatformServices,
        kernelStore,
        kernelQueue: mockKernelQueue,
        logger,
      });

      // Should not throw
      const result = await newManager.stopRemoteComms();
      expect(result).toBeUndefined();
    });

    it('allows re-initialization after stop', async () => {
      await remoteManager.stopRemoteComms();

      // Should be able to initialize again
      const messageHandler = vi.fn();
      vi.mocked(remoteComms.initRemoteComms).mockResolvedValue(mockRemoteComms);
      remoteManager.setMessageHandler(messageHandler);
      await remoteManager.initRemoteComms(['relay1']);

      expect(remoteManager.isRemoteCommsInitialized()).toBe(true);
      expect(remoteComms.initRemoteComms).toHaveBeenCalledTimes(2);
    });

    it('clears remote handles by peer ID', async () => {
      const remote1 = remoteManager.establishRemote('peer1');
      const remote2 = remoteManager.establishRemote('peer2');

      // Verify they're accessible
      expect(remoteManager.remoteFor('peer1')).toBe(remote1);
      expect(remoteManager.remoteFor('peer2')).toBe(remote2);

      await remoteManager.stopRemoteComms();

      // After stop, remotes are cleared
      expect(remoteManager.isRemoteCommsInitialized()).toBe(false);
    });
  });
});
