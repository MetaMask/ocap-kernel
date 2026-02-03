import { generateKeyPairFromSeed } from '@libp2p/crypto/keys';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
import { fromHex } from '@metamask/kernel-utils';
import type { Logger } from '@metamask/logger';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  initRemoteComms,
  parseOcapURL,
  getKnownRelays,
} from './remote-comms.ts';
import { createMockRemotesFactory } from '../../../test/remotes-mocks.ts';
import type { KernelStore } from '../../store/index.ts';
import type { PlatformServices } from '../../types.ts';
import { mnemonicToSeed } from '../../utils/bip39.ts';
import type { RemoteMessageHandler } from '../types.ts';

describe('remote-comms', () => {
  let mockKernelStore: KernelStore;
  let mockPlatformServices: PlatformServices;
  let mockRemoteMessageHandler: RemoteMessageHandler;
  let mockFactory: ReturnType<typeof createMockRemotesFactory>;

  beforeEach(() => {
    mockFactory = createMockRemotesFactory();
    const mocks = mockFactory.makeRemoteCommsMocks();
    mockKernelStore = mocks.kernelStore;
    mockPlatformServices = mocks.platformServices;
    mockRemoteMessageHandler = mocks.remoteMessageHandler;

    let counter = 1;
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((arr) => {
      arr[0] = counter;
      counter += 1;
      return arr;
    });
  });

  describe('initRemoteComms', () => {
    it('creates a working remote comms object with expected state', async () => {
      const testRelays = [
        '/dns4/relay1.example.com/tcp/443/wss/p2p-circuit',
        '/dns4/relay2.example.com/tcp/443/wss/p2p-circuit',
      ];
      const remoteComms = await initRemoteComms(
        mockKernelStore,
        mockPlatformServices,
        mockRemoteMessageHandler,
        { relays: testRelays },
      );
      expect(remoteComms).toHaveProperty('getPeerId');
      expect(remoteComms).toHaveProperty('issueOcapURL');
      expect(remoteComms).toHaveProperty('redeemLocalOcapURL');
      expect(remoteComms).toHaveProperty('sendRemoteMessage');
      expect(remoteComms).toHaveProperty('registerLocationHints');

      const keySeed = mockKernelStore.kv.get('keySeed');
      expect(keySeed).toBe(
        '0100000000000000000000000000000000000000000000000000000000000000',
      );

      const ocapURLKey = mockKernelStore.kv.get('ocapURLKey');
      expect(ocapURLKey).toBe(
        '0200000000000000000000000000000000000000000000000000000000000000',
      );

      const peerId = mockKernelStore.kv.get('peerId');
      const keyPair = await generateKeyPairFromSeed(
        'Ed25519',
        fromHex(keySeed as string),
      );
      expect(peerId).toBe(peerIdFromPrivateKey(keyPair).toString());

      expect(remoteComms.getPeerId()).toBe(peerId);

      const ocapURL = await remoteComms.issueOcapURL('zot');
      const { oid } = parseOcapURL(ocapURL);
      const knownRelays = getKnownRelays(mockKernelStore.kv);
      expect(Array.isArray(knownRelays)).toBe(true);
      expect(knownRelays.length).toBeGreaterThan(0);
      expect(knownRelays).toStrictEqual(testRelays);
      const referenceURL = `ocap:${oid}@${peerId},${testRelays.join(',')}`;
      expect(ocapURL).toBe(referenceURL);

      const kref = await remoteComms.redeemLocalOcapURL(ocapURL);
      expect(kref).toBe('zot');

      await remoteComms.sendRemoteMessage('elsewhere', 'your message here');
      expect(mockPlatformServices.sendRemoteMessage).toHaveBeenCalledWith(
        'elsewhere',
        'your message here',
      );

      await remoteComms.sendRemoteMessage('peer1', 'msg');
      expect(mockPlatformServices.sendRemoteMessage).toHaveBeenCalledWith(
        'peer1',
        'msg',
      );
    });

    it('honors pre-existing comms initialization parameters when present', async () => {
      const mockPeerId = 'mockPeerId';
      const mockKeySeed = 'abcdef';
      const mockOcapURLKey = 'mockOcapURLKey';
      mockKernelStore.kv.set('peerId', mockPeerId);
      mockKernelStore.kv.set('keySeed', mockKeySeed);
      mockKernelStore.kv.set('ocapURLKey', mockOcapURLKey);
      const remoteComms = await initRemoteComms(
        mockKernelStore,
        mockPlatformServices,
        mockRemoteMessageHandler,
      );
      expect(remoteComms).toHaveProperty('getPeerId');
      expect(remoteComms).toHaveProperty('issueOcapURL');
      expect(remoteComms).toHaveProperty('redeemLocalOcapURL');
      expect(remoteComms).toHaveProperty('sendRemoteMessage');
      expect(remoteComms).toHaveProperty('registerLocationHints');
      expect(mockKernelStore.kv.get('peerId')).toBe(mockPeerId);
      expect(remoteComms.getPeerId()).toBe(mockPeerId);
      expect(mockKernelStore.kv.get('keySeed')).toBe(mockKeySeed);
      expect(mockKernelStore.kv.get('ocapURLKey')).toBe(mockOcapURLKey);
    });

    it('passes options object to platformServices.initializeRemoteComms', async () => {
      const options = {
        relays: ['/dns4/relay.example/tcp/443/wss/p2p/relay'],
        maxRetryAttempts: 5,
        maxQueue: 100,
      };
      await initRemoteComms(
        mockKernelStore,
        mockPlatformServices,
        mockRemoteMessageHandler,
        options,
      );
      expect(mockPlatformServices.initializeRemoteComms).toHaveBeenCalledWith(
        expect.any(String), // keySeed
        expect.objectContaining({
          relays: options.relays,
          maxRetryAttempts: options.maxRetryAttempts,
          maxQueue: options.maxQueue,
        }),
        mockRemoteMessageHandler,
        undefined, // onRemoteGiveUp
        undefined, // incarnationId
      );
    });

    it('uses getKnownRelays when options.relays is empty', async () => {
      const storedRelays = [
        '/dns4/stored-relay1.example/tcp/443/wss/p2p/relay1',
        '/dns4/stored-relay2.example/tcp/443/wss/p2p/relay2',
      ];
      mockKernelStore.kv.set('knownRelays', JSON.stringify(storedRelays));
      await initRemoteComms(
        mockKernelStore,
        mockPlatformServices,
        mockRemoteMessageHandler,
        {}, // empty options
      );
      expect(mockPlatformServices.initializeRemoteComms).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          relays: storedRelays,
        }),
        mockRemoteMessageHandler,
        undefined,
        undefined, // incarnationId
      );
    });

    it('passes onRemoteGiveUp callback to platformServices', async () => {
      const onRemoteGiveUp = vi.fn();
      await initRemoteComms(
        mockKernelStore,
        mockPlatformServices,
        mockRemoteMessageHandler,
        {},
        undefined, // logger
        undefined, // keySeed
        onRemoteGiveUp,
      );
      expect(mockPlatformServices.initializeRemoteComms).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        mockRemoteMessageHandler,
        onRemoteGiveUp,
        undefined, // incarnationId
      );
    });

    it('passes incarnationId to platformServices', async () => {
      const incarnationId = 'test-incarnation-id';
      await initRemoteComms(
        mockKernelStore,
        mockPlatformServices,
        mockRemoteMessageHandler,
        {},
        undefined, // logger
        undefined, // keySeed
        undefined, // onRemoteGiveUp
        incarnationId,
      );
      expect(mockPlatformServices.initializeRemoteComms).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        mockRemoteMessageHandler,
        undefined,
        incarnationId,
      );
    });

    it('uses provided keySeed when creating new peer', async () => {
      const providedKeySeed =
        '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      await initRemoteComms(
        mockKernelStore,
        mockPlatformServices,
        mockRemoteMessageHandler,
        {},
        undefined,
        providedKeySeed,
      );
      expect(mockKernelStore.kv.get('keySeed')).toBe(providedKeySeed);
      const peerId = mockKernelStore.kv.get('peerId');
      expect(peerId).toBeDefined();
      // Verify peerId matches the provided keySeed
      const keyPair = await generateKeyPairFromSeed(
        'Ed25519',
        fromHex(providedKeySeed),
      );
      expect(peerId).toBe(peerIdFromPrivateKey(keyPair).toString());
    });

    it('calls logger.log when existing peer id is found', async () => {
      const mockLogger = {
        log: vi.fn(),
        error: vi.fn(),
      };
      const mockPeerId = 'existing-peer-id';
      const mockKeySeed = 'abcdef';
      mockKernelStore.kv.set('peerId', mockPeerId);
      mockKernelStore.kv.set('keySeed', mockKeySeed);
      await initRemoteComms(
        mockKernelStore,
        mockPlatformServices,
        mockRemoteMessageHandler,
        {},
        mockLogger as unknown as Logger,
      );
      expect(mockLogger.log).toHaveBeenCalledWith(
        `comms init: existing peer id: ${mockPeerId}`,
      );
    });

    it('calls logger.log when new peer id is created', async () => {
      const mockLogger = {
        log: vi.fn(),
        error: vi.fn(),
      };
      await initRemoteComms(
        mockKernelStore,
        mockPlatformServices,
        mockRemoteMessageHandler,
        {},
        mockLogger as unknown as Logger,
      );
      const peerId = mockKernelStore.kv.get('peerId');
      expect(mockLogger.log).toHaveBeenCalledWith(
        `comms init: new peer id: ${peerId}`,
      );
    });

    it('calls logger.log with relays', async () => {
      const mockLogger = {
        log: vi.fn(),
        error: vi.fn(),
      };
      const testRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relay'];
      await initRemoteComms(
        mockKernelStore,
        mockPlatformServices,
        mockRemoteMessageHandler,
        { relays: testRelays },
        mockLogger as unknown as Logger,
      );
      expect(mockLogger.log).toHaveBeenCalledWith(
        `relays: ${JSON.stringify(testRelays)}`,
      );
    });

    it('saves relays to KV store when provided', async () => {
      const testRelays = [
        '/dns4/relay1.example/tcp/443/wss/p2p/relay1',
        '/dns4/relay2.example/tcp/443/wss/p2p/relay2',
      ];
      await initRemoteComms(
        mockKernelStore,
        mockPlatformServices,
        mockRemoteMessageHandler,
        { relays: testRelays },
      );
      expect(mockKernelStore.kv.get('knownRelays')).toBe(
        JSON.stringify(testRelays),
      );
    });

    it('does not save relays to KV store when empty', async () => {
      const storedRelays = ['/dns4/stored-relay.example/tcp/443/wss/p2p/relay'];
      mockKernelStore.kv.set('knownRelays', JSON.stringify(storedRelays));
      await initRemoteComms(
        mockKernelStore,
        mockPlatformServices,
        mockRemoteMessageHandler,
        {}, // empty relays
      );
      // Should not overwrite existing relays
      expect(mockKernelStore.kv.get('knownRelays')).toBe(
        JSON.stringify(storedRelays),
      );
    });
  });

  describe('registerLocationHints', () => {
    it('calls platformServices.registerLocationHints', async () => {
      const remoteComms = await initRemoteComms(
        mockKernelStore,
        mockPlatformServices,
        mockRemoteMessageHandler,
      );
      await remoteComms.registerLocationHints('peer123', ['hint1', 'hint2']);
      expect(mockPlatformServices.registerLocationHints).toHaveBeenCalledWith(
        'peer123',
        ['hint1', 'hint2'],
      );
    });

    it('is a bound function from platformServices', async () => {
      const remoteComms = await initRemoteComms(
        mockKernelStore,
        mockPlatformServices,
        mockRemoteMessageHandler,
      );
      expect(typeof remoteComms.registerLocationHints).toBe('function');
      await remoteComms.registerLocationHints('peer123', ['hint1', 'hint2']);
      expect(mockPlatformServices.registerLocationHints).toHaveBeenCalled();
    });
  });

  describe('parseOcapURL', () => {
    it('parses ocap URL into constituent parts', () => {
      let sampleOcapURL = 'ocap:oid@peerid';
      const partsNoHints = parseOcapURL(sampleOcapURL);
      expect(partsNoHints).toStrictEqual({
        oid: 'oid',
        host: 'peerid',
        hints: [],
      });
      sampleOcapURL += ',hint1';
      const partsOneHints = parseOcapURL(sampleOcapURL);
      expect(partsOneHints).toStrictEqual({
        oid: 'oid',
        host: 'peerid',
        hints: ['hint1'],
      });
      sampleOcapURL += ',hint2';
      const partsMultiHints = parseOcapURL(sampleOcapURL);
      expect(partsMultiHints).toStrictEqual({
        oid: 'oid',
        host: 'peerid',
        hints: ['hint1', 'hint2'],
      });
    });

    it('rejects unparseable URL', () => {
      expect(() => parseOcapURL('utter nonsense')).toThrow('unparseable URL');
    });

    it('rejects bad ocap URL scheme', () => {
      expect(() => parseOcapURL('yuck:oid@peerid')).toThrow('not an ocap URL');
    });

    it.each([
      ['ocap:oid', 'missing @ separator'],
      ['ocap:oid@peerid@another', 'multiple @ separators'],
      ['ocap:oid@,peerless', 'empty host'],
      ['ocap:@peerid', 'empty oid'],
      ['ocap:oid@', 'empty where part'],
    ])('rejects badly formatted ocap URL: %s', (url, _description) => {
      expect(() => parseOcapURL(url)).toThrow('bad ocap URL');
    });
  });

  describe('getKnownRelays', () => {
    it('returns empty array when no relays are stored', () => {
      const mockKV = {
        get: vi.fn(() => undefined),
        set: vi.fn(),
        getRequired: vi.fn(),
        delete: vi.fn(),
        getNextKey: vi.fn(),
      };

      const relays = getKnownRelays(mockKV);
      expect(relays).toStrictEqual([]);
      expect(mockKV.get).toHaveBeenCalledWith('knownRelays');
    });

    it('returns parsed relays when they exist', () => {
      const storedRelays = [
        '/dns4/relay1.example/tcp/443/wss/p2p/relay1',
        '/dns4/relay2.example/tcp/443/wss/p2p/relay2',
      ];
      const mockKV = {
        get: vi.fn(() => JSON.stringify(storedRelays)),
        set: vi.fn(),
        getRequired: vi.fn(),
        delete: vi.fn(),
        getNextKey: vi.fn(),
      };

      const relays = getKnownRelays(mockKV);
      expect(relays).toStrictEqual(storedRelays);
      expect(mockKV.get).toHaveBeenCalledWith('knownRelays');
    });
  });

  describe('edge cases and error handling', () => {
    it('handles redeemLocalOcapURL with wrong host', async () => {
      const remoteComms = await initRemoteComms(
        mockKernelStore,
        mockPlatformServices,
        mockRemoteMessageHandler,
      );

      const wrongHostURL = 'ocap:someoid@different-peer-id';

      await expect(
        remoteComms.redeemLocalOcapURL(wrongHostURL),
      ).rejects.toThrow("ocapURL from a host that's not me");
    });

    it('handles redeemLocalOcapURL with decryption errors', async () => {
      const remoteComms = await initRemoteComms(
        mockKernelStore,
        mockPlatformServices,
        mockRemoteMessageHandler,
      );

      // First create a valid URL
      const validURL = await remoteComms.issueOcapURL('test-kref');
      const peerId = remoteComms.getPeerId();

      // Then corrupt the encrypted part while keeping valid base58btc format
      // Take the valid oid and modify it slightly to make decryption fail
      const { oid } = parseOcapURL(validURL);
      const corruptedOid = `${oid.slice(0, -5)}zzzzz`; // Change last 5 chars
      const corruptedURL = `ocap:${corruptedOid}@${peerId}`;

      await expect(
        remoteComms.redeemLocalOcapURL(corruptedURL),
      ).rejects.toThrow('ocapURL has bad object reference');
    });

    it('calls logger.error when decryption fails', async () => {
      const mockLogger = {
        log: vi.fn(),
        error: vi.fn(),
      };
      const remoteComms = await initRemoteComms(
        mockKernelStore,
        mockPlatformServices,
        mockRemoteMessageHandler,
        {},
        mockLogger as unknown as Logger,
      );

      const validURL = await remoteComms.issueOcapURL('test-kref');
      const peerId = remoteComms.getPeerId();
      const { oid } = parseOcapURL(validURL);
      const corruptedOid = `${oid.slice(0, -5)}zzzzz`;
      const corruptedURL = `ocap:${corruptedOid}@${peerId}`;

      await expect(
        remoteComms.redeemLocalOcapURL(corruptedURL),
      ).rejects.toThrow('ocapURL has bad object reference');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'problem deciphering encoded kref: ',
        expect.any(Error),
      );
    });

    it('handles issueOcapURL with short kref', async () => {
      const remoteComms = await initRemoteComms(
        mockKernelStore,
        mockPlatformServices,
        mockRemoteMessageHandler,
      );

      const shortKref = 'abc';
      const ocapURL = await remoteComms.issueOcapURL(shortKref);
      const kref = await remoteComms.redeemLocalOcapURL(ocapURL);
      expect(kref).toBe(shortKref);
    });

    it('handles issueOcapURL with empty kref', async () => {
      const remoteComms = await initRemoteComms(
        mockKernelStore,
        mockPlatformServices,
        mockRemoteMessageHandler,
      );

      const emptyKref = '';
      const ocapURL = await remoteComms.issueOcapURL(emptyKref);
      const kref = await remoteComms.redeemLocalOcapURL(ocapURL);
      expect(kref).toBe(emptyKref);
    });

    it('handles issueOcapURL with long kref', async () => {
      const remoteComms = await initRemoteComms(
        mockKernelStore,
        mockPlatformServices,
        mockRemoteMessageHandler,
      );

      const longKref = 'a'.repeat(100);
      const ocapURL = await remoteComms.issueOcapURL(longKref);
      const kref = await remoteComms.redeemLocalOcapURL(ocapURL);
      expect(kref).toBe(longKref);
    });

    it('handles issueOcapURL with kref containing special characters', async () => {
      const remoteComms = await initRemoteComms(
        mockKernelStore,
        mockPlatformServices,
        mockRemoteMessageHandler,
      );

      const specialKref = 'kref-with-special-chars-!@#$%^&*()';
      const ocapURL = await remoteComms.issueOcapURL(specialKref);
      const kref = await remoteComms.redeemLocalOcapURL(ocapURL);
      expect(kref).toBe(specialKref);
    });

    it('includes knownRelays in issued ocap URLs', async () => {
      const testRelays = [
        '/dns4/relay1.example/tcp/443/wss/p2p/relay1',
        '/dns4/relay2.example/tcp/443/wss/p2p/relay2',
      ];
      const remoteComms = await initRemoteComms(
        mockKernelStore,
        mockPlatformServices,
        mockRemoteMessageHandler,
        { relays: testRelays },
      );

      const ocapURL = await remoteComms.issueOcapURL('test-kref');
      const { hints } = parseOcapURL(ocapURL);
      expect(hints).toStrictEqual(testRelays);
    });

    it('includes stored relays in issued ocap URLs when options.relays is empty', async () => {
      const storedRelays = [
        '/dns4/stored-relay1.example/tcp/443/wss/p2p/relay1',
        '/dns4/stored-relay2.example/tcp/443/wss/p2p/relay2',
      ];
      mockKernelStore.kv.set('knownRelays', JSON.stringify(storedRelays));
      const remoteComms = await initRemoteComms(
        mockKernelStore,
        mockPlatformServices,
        mockRemoteMessageHandler,
        {},
      );

      const ocapURL = await remoteComms.issueOcapURL('test-kref');
      const { hints } = parseOcapURL(ocapURL);
      expect(hints).toStrictEqual(storedRelays);
    });
  });

  describe('initRemoteComms with mnemonic option', () => {
    // Valid 12-word test mnemonic
    const VALID_12_WORD_MNEMONIC =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    // Valid 24-word test mnemonic
    const VALID_24_WORD_MNEMONIC =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';

    it('uses mnemonic to derive seed when provided', async () => {
      const remoteComms = await initRemoteComms(
        mockKernelStore,
        mockPlatformServices,
        mockRemoteMessageHandler,
        { mnemonic: VALID_12_WORD_MNEMONIC },
      );

      const keySeed = mockKernelStore.kv.get('keySeed');
      expect(keySeed).toBeDefined();
      // The seed should be derived from the mnemonic
      const expectedSeed = await mnemonicToSeed(VALID_12_WORD_MNEMONIC);
      expect(keySeed).toBe(expectedSeed);

      // Verify peerId matches the derived seed
      const peerId = remoteComms.getPeerId();
      const keyPair = await generateKeyPairFromSeed(
        'Ed25519',
        fromHex(expectedSeed),
      );
      expect(peerId).toBe(peerIdFromPrivateKey(keyPair).toString());
    });

    it('produces same peer ID for same mnemonic', async () => {
      // First init with mnemonic
      const remoteComms1 = await initRemoteComms(
        mockKernelStore,
        mockPlatformServices,
        mockRemoteMessageHandler,
        { mnemonic: VALID_12_WORD_MNEMONIC },
      );
      const peerId1 = remoteComms1.getPeerId();

      // Reset store
      mockKernelStore.kv.delete('peerId');
      mockKernelStore.kv.delete('keySeed');
      mockKernelStore.kv.delete('ocapURLKey');

      // Second init with same mnemonic
      const remoteComms2 = await initRemoteComms(
        mockKernelStore,
        mockPlatformServices,
        mockRemoteMessageHandler,
        { mnemonic: VALID_12_WORD_MNEMONIC },
      );
      const peerId2 = remoteComms2.getPeerId();

      expect(peerId1).toBe(peerId2);
    });

    it('throws error when mnemonic provided but peer ID already exists in store', async () => {
      // Set up existing peer ID
      const existingPeerId = 'existing-peer-id';
      const existingKeySeed = 'abcdef1234567890abcdef1234567890';
      mockKernelStore.kv.set('peerId', existingPeerId);
      mockKernelStore.kv.set('keySeed', existingKeySeed);

      await expect(
        initRemoteComms(
          mockKernelStore,
          mockPlatformServices,
          mockRemoteMessageHandler,
          { mnemonic: VALID_12_WORD_MNEMONIC },
        ),
      ).rejects.toThrow(
        'Cannot use mnemonic: kernel identity already exists. Use resetStorage to clear existing identity first.',
      );
    });

    it('logs mnemonic usage when provided', async () => {
      const mockLogger = {
        log: vi.fn(),
        error: vi.fn(),
      };

      await initRemoteComms(
        mockKernelStore,
        mockPlatformServices,
        mockRemoteMessageHandler,
        { mnemonic: VALID_12_WORD_MNEMONIC },
        mockLogger as unknown as Logger,
      );

      expect(mockLogger.log).toHaveBeenCalledWith(
        'comms init: using mnemonic for seed recovery',
      );
    });

    it('throws for invalid mnemonic', async () => {
      await expect(
        initRemoteComms(
          mockKernelStore,
          mockPlatformServices,
          mockRemoteMessageHandler,
          { mnemonic: 'invalid mnemonic phrase' },
        ),
      ).rejects.toThrow('Invalid BIP39 mnemonic');
    });

    it('works with 24-word mnemonic', async () => {
      const remoteComms = await initRemoteComms(
        mockKernelStore,
        mockPlatformServices,
        mockRemoteMessageHandler,
        { mnemonic: VALID_24_WORD_MNEMONIC },
      );

      const keySeed = mockKernelStore.kv.get('keySeed');
      expect(keySeed).toBeDefined();
      const expectedSeed = await mnemonicToSeed(VALID_24_WORD_MNEMONIC);
      expect(keySeed).toBe(expectedSeed);
      expect(remoteComms.getPeerId()).toBeDefined();
    });

    it('mnemonic option takes precedence over keySeed parameter', async () => {
      const providedKeySeed =
        '9999999999999999999999999999999999999999999999999999999999999999';

      await initRemoteComms(
        mockKernelStore,
        mockPlatformServices,
        mockRemoteMessageHandler,
        { mnemonic: VALID_12_WORD_MNEMONIC },
        undefined,
        providedKeySeed, // This should be ignored in favor of mnemonic
      );

      const storedKeySeed = mockKernelStore.kv.get('keySeed');
      const expectedSeed = await mnemonicToSeed(VALID_12_WORD_MNEMONIC);
      expect(storedKeySeed).toBe(expectedSeed);
      expect(storedKeySeed).not.toBe(providedKeySeed);
    });
  });
});
