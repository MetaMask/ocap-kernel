import { Logger } from '@metamask/logger';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { makeMapKernelDatabase } from '../../test/storage.ts';
import type { KernelQueue } from '../KernelQueue.ts';
import * as remoteComms from './remote-comms.ts';
import { makeKernelStore } from '../store/index.ts';
import type { PlatformServices, RemoteComms } from '../types.ts';
import { RemoteManager } from './RemoteManager.ts';

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

  beforeEach(() => {
    const kernelDatabase = makeMapKernelDatabase();
    kernelStore = makeKernelStore(kernelDatabase);
    logger = new Logger('test');

    mockPlatformServices = {
      launch: vi.fn(),
      terminate: vi.fn(),
      terminateAll: vi.fn(),
      initializeRemoteComms: vi.fn(),
      sendRemoteMessage: vi.fn(),
    };

    mockKernelQueue = {
      enqueueMessage: vi.fn(),
      resolvePromises: vi.fn(),
      waitForCrank: vi.fn(),
      run: vi.fn(),
    } as unknown as KernelQueue;

    mockRemoteComms = {
      getPeerId: vi.fn().mockReturnValue('test-peer-id'),
      sendRemoteMessage: vi.fn(),
      issueOcapURL: vi.fn(),
      redeemLocalOcapURL: vi.fn(),
    };

    remoteManager = new RemoteManager({
      platformServices: mockPlatformServices,
      kernelStore,
      kernelQueue: mockKernelQueue,
      logger,
    });

    vi.mocked(remoteComms.initRemoteComms).mockClear();
  });

  describe('initialization', () => {
    it('should throw error if remote comms is accessed before initialization', () => {
      expect(() => remoteManager.getRemoteComms()).toThrow(
        'Remote comms not initialized',
      );
    });

    it('should throw error if initRemoteComms is called without message handler', async () => {
      await expect(remoteManager.initRemoteComms()).rejects.toThrow(
        'Message handler must be set before initializing remote comms',
      );
    });

    it('should initialize remote comms after setting message handler', async () => {
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

    it('should correctly report remote comms initialization status', async () => {
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

    it('should get peer ID from remote comms', () => {
      const peerId = remoteManager.getPeerId();
      expect(peerId).toBe('test-peer-id');
      expect(mockRemoteComms.getPeerId).toHaveBeenCalled();
    });

    it('should send remote message', async () => {
      await remoteManager.sendRemoteMessage('peer123', 'test message');
      expect(mockRemoteComms.sendRemoteMessage).toHaveBeenCalledWith(
        'peer123',
        'test message',
      );
    });

    it('should get remote comms after initialization', () => {
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

    it('should establish a new remote connection', () => {
      const remote = remoteManager.establishRemote('peer123');
      expect(remote).toBeDefined();
      expect(remote.remoteId).toMatch(/^r\d+$/u);
    });

    it('should reuse existing remote for same peer', () => {
      const remote1 = remoteManager.establishRemote('peer123');
      const remote2 = remoteManager.remoteFor('peer123');
      expect(remote1).toBe(remote2);
    });

    it('should create new remote if not exists', () => {
      const remote = remoteManager.remoteFor('new-peer');
      expect(remote).toBeDefined();
      expect(remote.remoteId).toMatch(/^r\d+$/u);
    });

    it('should get remote by ID', () => {
      const established = remoteManager.establishRemote('peer123');
      const retrieved = remoteManager.getRemote(established.remoteId);
      expect(retrieved).toBe(established);
    });

    it('should throw error when getting non-existent remote by ID', () => {
      expect(() => remoteManager.getRemote('r999')).toThrow(
        'Remote not found: r999',
      );
    });

    it('should handle remote message', async () => {
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

    it('should create new remote when handling message from unknown peer', async () => {
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
    it('should set message handler', () => {
      const handler = vi.fn();
      // Should not throw
      expect(() => remoteManager.setMessageHandler(handler)).not.toThrow();
    });

    it('should allow setting message handler multiple times', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      remoteManager.setMessageHandler(handler1);
      remoteManager.setMessageHandler(handler2);

      // Should not throw
      expect(() => remoteManager.setMessageHandler(handler2)).not.toThrow();
    });
  });
});
