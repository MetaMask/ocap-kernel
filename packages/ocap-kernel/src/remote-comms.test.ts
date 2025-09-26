import { generateKeyPairFromSeed } from '@libp2p/crypto/keys';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
import { fromHex } from '@metamask/kernel-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  initRemoteComms,
  parseOcapURL,
  getKnownRelays,
} from './remote-comms.ts';
import { makeKernelStore } from './store/index.ts';
import type { KernelStore } from './store/index.ts';
import type { PlatformServices, RemoteMessageHandler } from './types.ts';
import { makeMapKernelDatabase } from '../test/storage.ts';

describe('remote-comms', () => {
  let mockKernelStore: KernelStore;
  let mockPlatformServices: PlatformServices;
  let mockRemoteMessageHandler: RemoteMessageHandler;

  beforeEach(() => {
    mockKernelStore = makeKernelStore(makeMapKernelDatabase());
    mockPlatformServices = {
      launch: vi.fn(),
      terminate: vi.fn(),
      terminateAll: vi.fn(),
      sendRemoteMessage: vi.fn(),
      initializeRemoteComms: vi.fn(),
    } as unknown as PlatformServices;
    mockRemoteMessageHandler = vi.fn() as unknown as RemoteMessageHandler;
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
        testRelays,
      );
      expect(remoteComms).toHaveProperty('getPeerId');
      expect(remoteComms).toHaveProperty('issueOcapURL');
      expect(remoteComms).toHaveProperty('redeemLocalOcapURL');
      expect(remoteComms).toHaveProperty('sendRemoteMessage');

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
        fromHex(keySeed),
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
      expect(mockKernelStore.kv.get('peerId')).toBe(mockPeerId);
      expect(remoteComms.getPeerId()).toBe(mockPeerId);
      expect(mockKernelStore.kv.get('keySeed')).toBe(mockKeySeed);
      expect(mockKernelStore.kv.get('ocapURLKey')).toBe(mockOcapURLKey);
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

    it('rejects badly formatted ocap URL', () => {
      expect(() => parseOcapURL('ocap:oid')).toThrow('bad ocap URL');
      expect(() => parseOcapURL('ocap:oid@peerid@another')).toThrow(
        'bad ocap URL',
      );
      expect(() => parseOcapURL('ocap:oid@,peerless')).toThrow('bad ocap URL');
    });
  });
});
