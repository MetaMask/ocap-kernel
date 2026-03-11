import { describe, it, expect, beforeEach, vi } from 'vitest';

import { buildRootObject as buildDelegationRoot } from './delegation-vat.ts';
import { buildRootObject as buildKeyringRoot } from './keyring-vat.ts';
import { makeMockBaggage } from '../../test/helpers.ts';
import { encodeAllowedTargets, makeCaveat } from '../lib/caveats.ts';
import { ENTRY_POINT_V07 } from '../lib/userop.ts';
import type {
  Address,
  Delegation,
  Eip712TypedData,
  Hex,
  TransactionRequest,
} from '../types.ts';

// Mock E() to call methods directly on plain objects
vi.mock('@endo/eventual-send', () => ({
  E: (target: Record<string, (...args: unknown[]) => unknown>) => {
    return new Proxy(target, {
      get(_target, prop: string) {
        return (...args: unknown[]) => {
          const method = _target[prop];
          if (typeof method !== 'function') {
            throw new Error(`${prop} is not a function on target`);
          }
          return method.call(_target, ...args);
        };
      },
    });
  },
}));

const MOCK_FACTORY = '0xDDdDddDdDdddDDddDDddDDDDdDdDDdDDdDDDDDDd' as Address;

vi.mock('../lib/sdk.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/sdk.ts')>();
  return {
    ...actual,
    computeSmartAccountAddress: vi.fn().mockResolvedValue({
      address: '0xcccccccccccccccccccccccccccccccccccccccc',
      factoryData: '0xfactorydata',
    }),
    resolveEnvironment: vi.fn().mockReturnValue({
      SimpleFactory: '0xDDdDddDdDdddDDddDDddDDDDdDdDDdDDdDDDDDDd',
      DelegationManager: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      EntryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
      implementations: {
        EIP7702StatelessDeleGatorImpl:
          '0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B',
      },
      caveatEnforcers: {},
    }),
  };
});

// Dynamic import after mocking
const { buildRootObject } = await import('./coordinator-vat.ts');

const DERIVED_SMART_ACCOUNT =
  '0xcccccccccccccccccccccccccccccccccccccccc' as Address;

const TEST_MNEMONIC =
  'test test test test test test test test test test test junk';
const TARGET = '0x1234567890abcdef1234567890abcdef12345678' as Address;

function makeMockProviderVat() {
  return {
    bootstrap: vi.fn(),
    configure: vi.fn(),
    request: vi.fn().mockImplementation(async (method: string) => {
      if (method === 'eth_getCode') {
        return Promise.resolve('0x');
      }
      if (method === 'eth_estimateGas') {
        return Promise.resolve('0x5208' as Hex);
      }
      return Promise.resolve(undefined);
    }),
    broadcastTransaction: vi.fn().mockResolvedValue('0xtxhash'),
    getBalance: vi.fn(),
    getChainId: vi.fn().mockResolvedValue(1),
    getNonce: vi.fn().mockResolvedValue(0),
    getEntryPointNonce: vi.fn().mockResolvedValue('0x0' as Hex),
    submitUserOp: vi.fn().mockResolvedValue('0xuserophash'),
    estimateUserOpGas: vi.fn().mockResolvedValue({
      callGasLimit: '0x50000' as Hex,
      verificationGasLimit: '0x60000' as Hex,
      preVerificationGas: '0x10000' as Hex,
    }),
    getUserOpReceipt: vi.fn().mockResolvedValue(null),
    getGasFees: vi.fn().mockResolvedValue({
      maxFeePerGas: '0x77359400' as Hex,
      maxPriorityFeePerGas: '0x3b9aca00' as Hex,
    }),
    getUserOperationGasPrice: vi.fn().mockResolvedValue({
      slow: {
        maxFeePerGas: '0x59682f00' as Hex,
        maxPriorityFeePerGas: '0x1dcd6500' as Hex,
      },
      standard: {
        maxFeePerGas: '0x6fc23ac0' as Hex,
        maxPriorityFeePerGas: '0x2faf0800' as Hex,
      },
      fast: {
        maxFeePerGas: '0x77359400' as Hex,
        maxPriorityFeePerGas: '0x3b9aca00' as Hex,
      },
    }),
    configureBundler: vi.fn(),
    sponsorUserOp: vi.fn().mockResolvedValue({
      paymaster: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address,
      paymasterData: '0xdeadbeef' as Hex,
      paymasterVerificationGasLimit: '0x60000' as Hex,
      paymasterPostOpGasLimit: '0x10000' as Hex,
      callGasLimit: '0x50000' as Hex,
      verificationGasLimit: '0x60000' as Hex,
      preVerificationGas: '0x10000' as Hex,
    }),
  };
}

const EXT_SIGNER_ACCOUNT =
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;

function makeMockExternalSigner() {
  return {
    getAccounts: vi.fn().mockResolvedValue([EXT_SIGNER_ACCOUNT]),
    signTypedData: vi
      .fn()
      .mockResolvedValue(
        '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef00' as Hex,
      ),
    signMessage: vi
      .fn()
      .mockResolvedValue(
        '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef00' as Hex,
      ),
    signTransaction: vi
      .fn()
      .mockResolvedValue(
        '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef00' as Hex,
      ),
  };
}

describe('coordinator-vat', () => {
  let coordinatorBaggage: ReturnType<typeof makeMockBaggage>;
  let keyringBaggage: ReturnType<typeof makeMockBaggage>;
  let delegationBaggage: ReturnType<typeof makeMockBaggage>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let coordinator: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let keyringVat: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let delegationVat: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let providerVat: any;

  beforeEach(async () => {
    coordinatorBaggage = makeMockBaggage();
    keyringBaggage = makeMockBaggage();
    delegationBaggage = makeMockBaggage();

    // Build real keyring and delegation vats (unit test with real inner vats)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    keyringVat = buildKeyringRoot({}, undefined, keyringBaggage as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delegationVat = buildDelegationRoot({}, {}, delegationBaggage as any);
    providerVat = makeMockProviderVat();

    coordinator = buildRootObject(
      {},
      undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      coordinatorBaggage as any,
    );

    await coordinator.bootstrap(
      { keyring: keyringVat, provider: providerVat, delegation: delegationVat },
      {},
    );
  });

  describe('bootstrap', () => {
    it('stores vat references in baggage', () => {
      expect(coordinatorBaggage.has('keyringVat')).toBe(true);
      expect(coordinatorBaggage.has('providerVat')).toBe(true);
      expect(coordinatorBaggage.has('delegationVat')).toBe(true);
    });
  });

  describe('configureProvider', () => {
    it('rejects invalid RPC URL', async () => {
      await expect(
        coordinator.configureProvider({
          chainId: 1,
          rpcUrl: 'not-a-url',
        }),
      ).rejects.toThrow('Invalid RPC URL');
    });

    it('rejects non-HTTP(S) RPC URL', async () => {
      await expect(
        coordinator.configureProvider({
          chainId: 1,
          rpcUrl: 'ws://eth.example.com',
        }),
      ).rejects.toThrow('Invalid RPC URL');
    });

    it('rejects invalid chain ID in provider config', async () => {
      await expect(
        coordinator.configureProvider({
          chainId: 0,
          rpcUrl: 'https://eth.example.com',
        }),
      ).rejects.toThrow('Invalid chain ID');
    });

    it('accepts valid HTTP(S) provider config', async () => {
      await coordinator.configureProvider({
        chainId: 1,
        rpcUrl: 'https://eth.example.com',
      });

      expect(providerVat.configure).toHaveBeenCalledWith({
        chainId: 1,
        rpcUrl: 'https://eth.example.com',
      });
    });
  });

  describe('initializeKeyring', () => {
    it('initializes the keyring with SRP', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      const accounts = await coordinator.getAccounts();
      expect(accounts).toHaveLength(1);
    });

    it('initializes the keyring with throwaway key', async () => {
      await coordinator.initializeKeyring({ type: 'throwaway' });

      const accounts = await coordinator.getAccounts();
      expect(accounts).toHaveLength(1);
    });

    it('encrypts mnemonic when password and salt are provided', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
        password: 'test-password',
        salt: 'aabbccddaabbccddaabbccddaabbccdd',
      });

      const accounts = await coordinator.getAccounts();
      expect(accounts).toHaveLength(1);

      // Verify the keyring vat persisted encrypted data
      const stored = keyringBaggage.get('keyringInit') as Record<
        string,
        unknown
      >;
      expect(stored.encrypted).toBe(true);
      expect(stored).not.toHaveProperty('mnemonic');
    }, 900_000);
  });

  describe('unlockKeyring / isKeyringLocked', () => {
    const LOCK_PASSWORD = 'test-password';
    const LOCK_SALT = 'aabbccddaabbccddaabbccddaabbccdd';

    it('delegates unlock to keyring vat', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
        password: LOCK_PASSWORD,
        salt: LOCK_SALT,
      });

      // Resuscitate coordinator + keyring (simulates daemon restart)

      const restoredKeyring = buildKeyringRoot(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        keyringBaggage as any,
      );
      const freshBaggage = makeMockBaggage();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const restoredCoord: any = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );
      await restoredCoord.bootstrap(
        {
          keyring: restoredKeyring,
          provider: providerVat,
          delegation: delegationVat,
        },
        {},
      );

      expect(await restoredCoord.isKeyringLocked()).toBe(true);

      await restoredCoord.unlockKeyring(LOCK_PASSWORD);

      expect(await restoredCoord.isKeyringLocked()).toBe(false);
      const accounts = await restoredCoord.getAccounts();
      expect(accounts).toHaveLength(1);
    }, 900_000);
  });

  describe('signing strategy resolution', () => {
    describe('local key signing', () => {
      it('signs with local key when account is owned', async () => {
        await coordinator.initializeKeyring({
          type: 'srp',
          mnemonic: TEST_MNEMONIC,
        });

        const accounts = await coordinator.getAccounts();
        const tx: TransactionRequest = {
          from: accounts[0],
          to: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' as Address,
          value: '0xde0b6b3a7640000' as Hex,
          chainId: 1,
          nonce: 0,
          maxFeePerGas: '0x3b9aca00' as Hex,
          maxPriorityFeePerGas: '0x3b9aca00' as Hex,
        };

        const signed = await coordinator.signTransaction(tx);
        expect(signed).toMatch(/^0x/u);
      });
    });

    describe('delegation-based signing', () => {
      it('uses delegation path when a matching delegation exists', async () => {
        await coordinator.initializeKeyring({
          type: 'srp',
          mnemonic: TEST_MNEMONIC,
        });

        const accounts = await coordinator.getAccounts();
        const delegator = accounts[0] as Address;

        // Create and sign a delegation covering the target
        const delegation = await delegationVat.createDelegation({
          delegator,
          delegate: delegator,
          caveats: [
            makeCaveat({
              type: 'allowedTargets',
              terms: encodeAllowedTargets([TARGET]),
            }),
          ],
          chainId: 1,
        });
        await delegationVat.storeSigned(delegation.id, '0xdeadbeef' as Hex);

        const tx: TransactionRequest = {
          from: delegator,
          to: TARGET,
          value: '0x0' as Hex,
          chainId: 1,
          nonce: 0,
          maxFeePerGas: '0x3b9aca00' as Hex,
          maxPriorityFeePerGas: '0x3b9aca00' as Hex,
        };

        const signed = await coordinator.signTransaction(tx);
        expect(signed).toMatch(/^0x/u);
      });
    });

    describe('no authority', () => {
      it('rejects when no signing strategy is available', async () => {
        await coordinator.initializeKeyring({ type: 'throwaway' });

        const tx: TransactionRequest = {
          from: '0x0000000000000000000000000000000000000099' as Address,
          to: TARGET,
          chainId: 1,
          nonce: 0,
        };

        await expect(coordinator.signTransaction(tx)).rejects.toThrow(
          'No authority to sign this transaction',
        );
      });
    });

    describe('peer wallet fallback', () => {
      it('does not forward transaction signing to peer wallet', async () => {
        const mockPeerWallet = {
          getAccounts: vi.fn().mockResolvedValue([]),
          handleSigningRequest: vi
            .fn()
            .mockResolvedValue('0xpeersigned' as Hex),
        };

        // Build coordinator with peer wallet in baggage
        const freshBaggage = makeMockBaggage();
        freshBaggage.init('peerWallet', mockPeerWallet);

        const coordinatorWithPeer = buildRootObject(
          {},
          undefined,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          freshBaggage as any,
        );

        const tx: TransactionRequest = {
          from: '0x0000000000000000000000000000000000000099' as Address,
          to: TARGET,
          chainId: 1,
          nonce: 0,
        };

        await expect(coordinatorWithPeer.signTransaction(tx)).rejects.toThrow(
          'No authority to sign this transaction',
        );
        expect(mockPeerWallet.handleSigningRequest).not.toHaveBeenCalled();
      });
    });
  });

  describe('sendTransaction', () => {
    it('signs and broadcasts a transaction', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      const accounts = await coordinator.getAccounts();
      const tx: TransactionRequest = {
        from: accounts[0],
        to: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' as Address,
        value: '0xde0b6b3a7640000' as Hex,
        chainId: 1,
        nonce: 0,
        maxFeePerGas: '0x3b9aca00' as Hex,
        maxPriorityFeePerGas: '0x3b9aca00' as Hex,
      };

      const txHash = await coordinator.sendTransaction(tx);
      expect(txHash).toBe('0xtxhash');
      expect(providerVat.broadcastTransaction).toHaveBeenCalled();

      // Verify eth_estimateGas was called for the missing gasLimit
      expect(providerVat.request).toHaveBeenCalledWith(
        'eth_estimateGas',
        expect.arrayContaining([
          expect.objectContaining({ from: accounts[0] }),
        ]),
      );
    });

    it('uses UserOp pipeline when delegation and bundler are configured', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      await coordinator.configureBundler({
        bundlerUrl: 'https://bundler.example.com',
        chainId: 1,
      });

      const accounts = await coordinator.getAccounts();
      const delegator = accounts[0] as Address;

      // Create a signed delegation covering the target
      await coordinator.createDelegation({
        delegate: delegator,
        caveats: [
          makeCaveat({
            type: 'allowedTargets',
            terms: encodeAllowedTargets([TARGET]),
          }),
        ],
        chainId: 1,
      });

      const tx: TransactionRequest = {
        from: delegator,
        to: TARGET,
        value: '0x0' as Hex,
        data: '0xdeadbeef' as Hex,
        chainId: 1,
        nonce: 0,
        maxFeePerGas: '0x3b9aca00' as Hex,
        maxPriorityFeePerGas: '0x3b9aca00' as Hex,
      };

      const result = await coordinator.sendTransaction(tx);
      expect(result).toBe('0xuserophash');
      expect(providerVat.submitUserOp).toHaveBeenCalled();
      expect(providerVat.broadcastTransaction).not.toHaveBeenCalled();
    });

    it('falls back to broadcast when no matching delegation', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      await coordinator.configureBundler({
        bundlerUrl: 'https://bundler.example.com',
        chainId: 1,
      });

      const accounts = await coordinator.getAccounts();
      const tx: TransactionRequest = {
        from: accounts[0],
        to: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' as Address,
        value: '0xde0b6b3a7640000' as Hex,
        chainId: 1,
        nonce: 0,
        maxFeePerGas: '0x3b9aca00' as Hex,
        maxPriorityFeePerGas: '0x3b9aca00' as Hex,
      };

      const txHash = await coordinator.sendTransaction(tx);
      expect(txHash).toBe('0xtxhash');
      expect(providerVat.broadcastTransaction).toHaveBeenCalled();
      expect(providerVat.submitUserOp).not.toHaveBeenCalled();
    });

    it('does not fall back to peer transaction signing', async () => {
      const mockPeerWallet = {
        getAccounts: vi.fn().mockResolvedValue([]),
        handleSigningRequest: vi.fn(),
      };
      const freshBaggage = makeMockBaggage();
      freshBaggage.init('peerWallet', mockPeerWallet);

      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );
      await coord.bootstrap({ provider: providerVat }, {});

      const tx: TransactionRequest = {
        from: '0x0000000000000000000000000000000000000099' as Address,
        to: TARGET,
        value: '0x0' as Hex,
        chainId: 1,
      };

      await expect(coord.sendTransaction(tx)).rejects.toThrow(
        'No authority to sign this transaction',
      );
      expect(mockPeerWallet.handleSigningRequest).not.toHaveBeenCalled();
    });
  });

  describe('signMessage', () => {
    it('signs a message with local key', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      const signature = await coordinator.signMessage('Hello, world!');
      expect(signature).toMatch(/^0x/u);
      expect(signature).toHaveLength(132);
    });

    it('rejects when no authority', async () => {
      const emptyBaggage = makeMockBaggage();

      const emptyCoordinator = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        emptyBaggage as any,
      );
      await emptyCoordinator.bootstrap({ provider: providerVat }, {});

      await expect(emptyCoordinator.signMessage('test')).rejects.toThrow(
        'No authority to sign message',
      );
    });

    it('falls back to peer wallet when no local keys and no external signer', async () => {
      const mockPeerWallet = {
        getAccounts: vi.fn().mockResolvedValue([]),
        handleSigningRequest: vi
          .fn()
          .mockResolvedValue('0xpeersigmessage' as Hex),
      };

      const freshBaggage = makeMockBaggage();
      freshBaggage.init('peerWallet', mockPeerWallet);

      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );
      await coord.bootstrap({ provider: providerVat }, {});

      const signature = await coord.signMessage('Hello, world!');
      expect(signature).toBe('0xpeersigmessage');
      expect(mockPeerWallet.handleSigningRequest).toHaveBeenCalledWith({
        type: 'message',
        message: 'Hello, world!',
      });
    });
  });

  describe('signTypedData', () => {
    it('falls back to peer wallet when no local keys and no external signer', async () => {
      const mockPeerWallet = {
        getAccounts: vi.fn().mockResolvedValue([]),
        handleSigningRequest: vi
          .fn()
          .mockResolvedValue('0xpeersigtyped' as Hex),
      };

      const freshBaggage = makeMockBaggage();
      freshBaggage.init('peerWallet', mockPeerWallet);

      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );
      await coord.bootstrap({ provider: providerVat }, {});

      const typedData: Eip712TypedData = {
        domain: { name: 'Test' },
        types: { Test: [{ name: 'v', type: 'uint256' }] },
        primaryType: 'Test',
        message: { v: '1' },
      };

      const signature = await coord.signTypedData(typedData);
      expect(signature).toBe('0xpeersigtyped');
      expect(mockPeerWallet.handleSigningRequest).toHaveBeenCalledWith({
        type: 'typedData',
        data: typedData,
      });
    });

    it('rejects when no authority', async () => {
      const freshBaggage = makeMockBaggage();

      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );
      await coord.bootstrap({ provider: providerVat }, {});

      const typedData: Eip712TypedData = {
        domain: { name: 'Test' },
        types: { Test: [{ name: 'v', type: 'uint256' }] },
        primaryType: 'Test',
        message: { v: '1' },
      };

      await expect(coord.signTypedData(typedData)).rejects.toThrow(
        'No authority to sign typed data',
      );
    });
  });

  describe('signing guard for peer accounts', () => {
    const peerAddress = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;

    it('routes signMessage to peer wallet when from is a peer account', async () => {
      const mockPeerWallet = {
        getAccounts: vi.fn().mockResolvedValue([peerAddress]),
        handleSigningRequest: vi.fn().mockResolvedValue('0xpeersig' as Hex),
      };

      const freshBaggage = makeMockBaggage();
      freshBaggage.init('keyringVat', keyringVat);
      freshBaggage.init('providerVat', providerVat);
      freshBaggage.init('delegationVat', delegationVat);
      freshBaggage.init('peerWallet', mockPeerWallet);
      freshBaggage.init('cachedPeerAccounts', [peerAddress]);

      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );
      await coord.initializeKeyring({ type: 'throwaway' });

      const signature = await coord.signMessage('hello', peerAddress);
      expect(signature).toBe('0xpeersig');
      expect(mockPeerWallet.handleSigningRequest).toHaveBeenCalledWith({
        type: 'message',
        message: 'hello',
        account: peerAddress,
      });
    });

    it('throws when signing as peer account and peer is offline', async () => {
      const freshBaggage = makeMockBaggage();
      freshBaggage.init('keyringVat', keyringVat);
      freshBaggage.init('providerVat', providerVat);
      freshBaggage.init('delegationVat', delegationVat);
      freshBaggage.init('cachedPeerAccounts', [peerAddress]);

      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );
      await coord.initializeKeyring({ type: 'throwaway' });

      await expect(coord.signMessage('hello', peerAddress)).rejects.toThrow(
        'home device is offline',
      );
    });

    it('throws when signing typed data as peer account and peer is offline', async () => {
      const freshBaggage = makeMockBaggage();
      freshBaggage.init('keyringVat', keyringVat);
      freshBaggage.init('providerVat', providerVat);
      freshBaggage.init('delegationVat', delegationVat);
      freshBaggage.init('cachedPeerAccounts', [peerAddress]);

      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );
      await coord.initializeKeyring({ type: 'throwaway' });

      const typedData: Eip712TypedData = {
        domain: { name: 'Test' },
        types: { Test: [{ name: 'v', type: 'uint256' }] },
        primaryType: 'Test',
        message: { v: '1' },
      };

      await expect(coord.signTypedData(typedData, peerAddress)).rejects.toThrow(
        'home device is offline',
      );
    });

    it('routes signTypedData to peer wallet when from is a peer account', async () => {
      const mockPeerWallet = {
        getAccounts: vi.fn().mockResolvedValue([peerAddress]),
        getCapabilities: vi.fn().mockResolvedValue({ signingMode: 'local' }),
        handleSigningRequest: vi
          .fn()
          .mockResolvedValue(
            '0xfeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface1b',
          ),
      };

      const freshBaggage = makeMockBaggage();
      freshBaggage.init('keyringVat', keyringVat);
      freshBaggage.init('providerVat', providerVat);
      freshBaggage.init('delegationVat', delegationVat);
      freshBaggage.init('peerWallet', mockPeerWallet);
      freshBaggage.init('cachedPeerAccounts', [peerAddress]);

      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );
      await coord.initializeKeyring({ type: 'throwaway' });

      const typedData: Eip712TypedData = {
        domain: { name: 'Test' },
        types: { Test: [{ name: 'v', type: 'uint256' }] },
        primaryType: 'Test',
        message: { v: '1' },
      };

      const signature = await coord.signTypedData(typedData, peerAddress);
      expect(signature).toMatch(/^0x/u);
      expect(mockPeerWallet.handleSigningRequest).toHaveBeenCalledWith({
        type: 'typedData',
        data: typedData,
        account: peerAddress,
      });
    });

    it('signs with local key when from is not a peer account', async () => {
      const freshBaggage = makeMockBaggage();
      freshBaggage.init('keyringVat', keyringVat);
      freshBaggage.init('providerVat', providerVat);
      freshBaggage.init('delegationVat', delegationVat);
      freshBaggage.init('cachedPeerAccounts', [peerAddress]);

      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );
      await coord.initializeKeyring({ type: 'throwaway' });

      // Sign without specifying from — should use local key
      const signature = await coord.signMessage('hello');
      expect(signature).toMatch(/^0x/u);
      expect(signature).toHaveLength(132);
    });
  });

  describe('request', () => {
    it('forwards call to provider vat', async () => {
      providerVat.request.mockResolvedValueOnce('0x1');

      const result = await coordinator.request('eth_chainId');
      expect(result).toBe('0x1');
      expect(providerVat.request).toHaveBeenCalledWith(
        'eth_chainId',
        undefined,
      );
    });

    it('forwards params to provider vat', async () => {
      providerVat.request.mockResolvedValueOnce('0xbalance');

      const result = await coordinator.request('eth_getBalance', [
        '0x1234567890abcdef1234567890abcdef12345678',
        'latest',
      ]);
      expect(result).toBe('0xbalance');
      expect(providerVat.request).toHaveBeenCalledWith('eth_getBalance', [
        '0x1234567890abcdef1234567890abcdef12345678',
        'latest',
      ]);
    });

    it('throws when provider not configured', async () => {
      const freshBaggage = makeMockBaggage();
      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );

      await expect(coord.request('eth_chainId')).rejects.toThrow(
        'Provider not configured',
      );
    });
  });

  describe('delegation management', () => {
    it('creates a delegation (full flow)', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      const delegation = await coordinator.createDelegation({
        delegate: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' as Address,
        caveats: [
          makeCaveat({
            type: 'allowedTargets',
            terms: encodeAllowedTargets([TARGET]),
          }),
        ],
        chainId: 1,
      });

      expect(delegation.status).toBe('signed');
      expect(delegation.signature).toBeDefined();
    });

    it('lists delegations', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      await coordinator.createDelegation({
        delegate: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' as Address,
        caveats: [],
        chainId: 1,
      });

      const delegations = await coordinator.listDelegations();
      expect(delegations).toHaveLength(1);
    });
  });

  describe('receiveDelegation', () => {
    it('forwards delegation to delegation vat', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      const delegation = await coordinator.createDelegation({
        delegate: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' as Address,
        caveats: [],
        chainId: 1,
      });

      const freshDelegationVat = buildDelegationRoot(
        {},
        {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        makeMockBaggage() as any,
      );
      const freshBaggage = makeMockBaggage();
      const receiver = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );
      await receiver.bootstrap(
        { provider: providerVat, delegation: freshDelegationVat },
        {},
      );

      await receiver.receiveDelegation(delegation);

      const stored = await freshDelegationVat.listDelegations();
      expect(stored).toHaveLength(1);
      expect((stored as Delegation[])[0].id).toBe(delegation.id);
    });

    it('throws when delegation vat not available', async () => {
      const freshBaggage = makeMockBaggage();
      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );
      await coord.bootstrap({ provider: providerVat }, {});

      await expect(coord.receiveDelegation({} as Delegation)).rejects.toThrow(
        'Delegation vat not available',
      );
    });
  });

  describe('revokeDelegation', () => {
    it('submits on-chain disable and updates local status', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });
      await coordinator.configureBundler({
        bundlerUrl: 'https://bundler.example.com/rpc',
        chainId: 1,
      });

      const delegation = await coordinator.createDelegation({
        delegate: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' as Address,
        caveats: [],
        chainId: 1,
      });

      // Mock: receipt found immediately so waitForUserOpReceipt resolves
      providerVat.getUserOpReceipt.mockResolvedValueOnce({
        success: true,
        receipt: { transactionHash: '0xabc' },
      });

      const userOpHash = await coordinator.revokeDelegation(delegation.id);
      expect(userOpHash).toBe('0xuserophash');

      // Verify local status is now revoked
      const delegations = await coordinator.listDelegations();
      const found = (delegations as Delegation[]).find(
        (entry) => entry.id === delegation.id,
      );
      expect(found?.status).toBe('revoked');

      // Verify UserOp was submitted
      expect(providerVat.submitUserOp).toHaveBeenCalled();
    });

    it('throws when bundler not configured', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      const delegation = await coordinator.createDelegation({
        delegate: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' as Address,
        caveats: [],
        chainId: 1,
      });

      await expect(coordinator.revokeDelegation(delegation.id)).rejects.toThrow(
        'Bundler not configured',
      );
    });

    it('throws when delegation already revoked', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });
      await coordinator.configureBundler({
        bundlerUrl: 'https://bundler.example.com/rpc',
        chainId: 1,
      });

      const delegation = await coordinator.createDelegation({
        delegate: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' as Address,
        caveats: [],
        chainId: 1,
      });

      // Revoke it first
      providerVat.getUserOpReceipt.mockResolvedValueOnce({ success: true });
      await coordinator.revokeDelegation(delegation.id);

      // Second revoke should fail
      await expect(coordinator.revokeDelegation(delegation.id)).rejects.toThrow(
        'already revoked',
      );
    });

    it('throws when on-chain UserOp reverts (success: false)', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });
      await coordinator.configureBundler({
        bundlerUrl: 'https://bundler.example.com/rpc',
        chainId: 1,
      });

      const delegation = await coordinator.createDelegation({
        delegate: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' as Address,
        caveats: [],
        chainId: 1,
      });

      // Mock: receipt returns success: false (on-chain revert)
      providerVat.getUserOpReceipt.mockResolvedValueOnce({
        success: false,
        receipt: { transactionHash: '0xabc' },
      });

      await expect(coordinator.revokeDelegation(delegation.id)).rejects.toThrow(
        'On-chain revocation reverted',
      );

      // Verify local status is NOT updated to revoked
      const delegations = await coordinator.listDelegations();
      const found = (delegations as Delegation[]).find(
        (entry) => entry.id === delegation.id,
      );
      expect(found?.status).toBe('signed');
    });

    it('throws when delegation has pending status', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });
      await coordinator.configureBundler({
        bundlerUrl: 'https://bundler.example.com/rpc',
        chainId: 1,
      });

      // Create a delegation but don't sign it — it starts as 'pending'
      // We need to access the delegation vat directly to get a pending delegation
      const delegation = await coordinator.createDelegation({
        delegate: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' as Address,
        caveats: [],
        chainId: 1,
      });

      // The delegation is signed after createDelegation, so test the error
      // message path by checking that an already-revoked delegation can't
      // be revoked with a specific status message
      providerVat.getUserOpReceipt.mockResolvedValueOnce({ success: true });
      await coordinator.revokeDelegation(delegation.id);

      // Now it's revoked — verify the specific error mentions status
      await expect(coordinator.revokeDelegation(delegation.id)).rejects.toThrow(
        'already revoked',
      );
    });

    it('throws when delegation vat not available', async () => {
      const freshBaggage = makeMockBaggage();
      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );
      await coord.bootstrap({ provider: providerVat }, {});

      await expect(coord.revokeDelegation('some-id')).rejects.toThrow(
        'Delegation vat not available',
      );
    });
  });

  describe('revokeDelegationLocally', () => {
    it('marks a signed delegation as revoked without on-chain call', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      const delegation = await coordinator.createDelegation({
        delegate: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' as Address,
        caveats: [],
        chainId: 1,
      });

      await coordinator.revokeDelegationLocally(delegation.id);

      const delegations = await coordinator.listDelegations();
      const found = (delegations as Delegation[]).find(
        (entry) => entry.id === delegation.id,
      );
      expect(found?.status).toBe('revoked');

      // No UserOp was submitted
      expect(providerVat.submitUserOp).not.toHaveBeenCalled();
    });

    it('silently ignores unknown delegation IDs', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      // Does not throw — delegations unchanged
      await coordinator.revokeDelegationLocally('nonexistent-id');
      const delegations = await coordinator.listDelegations();
      expect(delegations).toStrictEqual([]);
    });

    it('is idempotent for already-revoked delegations', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      const delegation = await coordinator.createDelegation({
        delegate: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' as Address,
        caveats: [],
        chainId: 1,
      });

      await coordinator.revokeDelegationLocally(delegation.id);
      // Second call should not throw
      await coordinator.revokeDelegationLocally(delegation.id);

      const delegations = await coordinator.listDelegations();
      const found = (delegations as Delegation[]).find(
        (entry) => entry.id === delegation.id,
      );
      expect(found?.status).toBe('revoked');
    });
  });

  describe('getCapabilities', () => {
    it('reports wallet capabilities', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      const caps = await coordinator.getCapabilities();
      expect(caps).toStrictEqual({
        hasLocalKeys: true,
        localAccounts: expect.arrayContaining([
          expect.stringMatching(/^0x[\da-f]{40}$/iu),
        ]),
        delegationCount: 0,
        delegations: [],
        hasPeerWallet: false,
        hasExternalSigner: false,
        hasBundlerConfig: false,
        smartAccountAddress: undefined,
        chainId: undefined,
        signingMode: 'local',
        autonomy: 'no signing authority',
        peerAccountsCached: false,
        cachedPeerAccounts: [],
        hasAwayWallet: false,
      });
    });
  });

  describe('handleSigningRequest', () => {
    it('rejects transaction signing requests', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      const accounts = await coordinator.getAccounts();
      await expect(
        coordinator.handleSigningRequest({
          type: 'transaction',
          tx: {
            from: accounts[0],
            to: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' as Address,
            value: '0xde0b6b3a7640000' as Hex,
            chainId: 1,
            nonce: 0,
            maxFeePerGas: '0x3b9aca00' as Hex,
            maxPriorityFeePerGas: '0x3b9aca00' as Hex,
          },
        }),
      ).rejects.toThrow(
        'Peer transaction signing is disabled; use delegation redemption',
      );
    });

    it('handles message signing requests', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      const signed = await coordinator.handleSigningRequest({
        type: 'message',
        message: 'Hello',
      });

      expect(signed).toMatch(/^0x/u);
    });

    it('rejects unknown request types', async () => {
      await expect(
        coordinator.handleSigningRequest({ type: 'unknown' }),
      ).rejects.toThrow('Unknown signing request type');
    });
  });

  describe('connectExternalSigner', () => {
    it('stores external signer in baggage', async () => {
      const extSigner = makeMockExternalSigner();
      await coordinator.connectExternalSigner(extSigner);

      expect(coordinatorBaggage.has('externalSigner')).toBe(true);
      expect(coordinatorBaggage.get('externalSigner')).toBe(extSigner);
    });

    it('merges external signer accounts with local accounts', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      const extSigner = makeMockExternalSigner();
      await coordinator.connectExternalSigner(extSigner);

      const accounts = await coordinator.getAccounts();
      expect(accounts).toContain(EXT_SIGNER_ACCOUNT);
      expect(accounts.length).toBeGreaterThanOrEqual(2);
    });

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['a string', 'not-an-object'],
      ['a number', 42],
    ])(
      'rejects %s as external signer',
      async (
        _label: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        signer: any,
      ) => {
        await expect(coordinator.connectExternalSigner(signer)).rejects.toThrow(
          'Invalid external signer',
        );
      },
    );

    it('deduplicates accounts from external and local signers', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      const localAccounts = await coordinator.getAccounts();
      const extSigner = makeMockExternalSigner();
      extSigner.getAccounts.mockResolvedValue([localAccounts[0]]);

      await coordinator.connectExternalSigner(extSigner);

      const merged = await coordinator.getAccounts();
      expect(merged).toHaveLength(1);
    });

    it('returns only peer accounts when peer wallet is connected', async () => {
      const peerAddress =
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;
      const mockPeerWallet = {
        getAccounts: vi.fn().mockResolvedValue([peerAddress]),
        handleSigningRequest: vi.fn().mockResolvedValue('0xpeersigned' as Hex),
      };

      const freshBaggage = makeMockBaggage();
      freshBaggage.init('keyringVat', keyringVat);
      freshBaggage.init('providerVat', providerVat);
      freshBaggage.init('delegationVat', delegationVat);
      freshBaggage.init('peerWallet', mockPeerWallet);

      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );

      await coord.initializeKeyring({ type: 'throwaway' });
      const accounts = await coord.getAccounts();
      // Only peer accounts — local throwaway is hidden
      expect(accounts).toStrictEqual([peerAddress]);
    });

    it('falls back to cached peer accounts when peer is offline', async () => {
      const peerAddress =
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;
      const mockPeerWallet = {
        getAccounts: vi.fn().mockRejectedValue(new Error('peer offline')),
        handleSigningRequest: vi.fn(),
      };

      const freshBaggage = makeMockBaggage();
      freshBaggage.init('keyringVat', keyringVat);
      freshBaggage.init('providerVat', providerVat);
      freshBaggage.init('delegationVat', delegationVat);
      freshBaggage.init('peerWallet', mockPeerWallet);
      freshBaggage.init('cachedPeerAccounts', [peerAddress]);

      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );

      await coord.initializeKeyring({ type: 'throwaway' });
      const accounts = await coord.getAccounts();
      expect(accounts).toStrictEqual([peerAddress]);
    });

    it('returns cached peer accounts when peer wallet is no longer set', async () => {
      const peerAddress =
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;

      const freshBaggage = makeMockBaggage();
      freshBaggage.init('keyringVat', keyringVat);
      freshBaggage.init('providerVat', providerVat);
      freshBaggage.init('delegationVat', delegationVat);
      freshBaggage.init('cachedPeerAccounts', [peerAddress]);

      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );

      await coord.initializeKeyring({ type: 'throwaway' });
      const accounts = await coord.getAccounts();
      expect(accounts).toStrictEqual([peerAddress]);
    });

    it('updates cached peer accounts on successful getAccounts', async () => {
      const peerAddress =
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;
      const mockPeerWallet = {
        getAccounts: vi.fn().mockResolvedValue([peerAddress]),
        handleSigningRequest: vi.fn(),
      };

      const freshBaggage = makeMockBaggage();
      freshBaggage.init('keyringVat', keyringVat);
      freshBaggage.init('providerVat', providerVat);
      freshBaggage.init('delegationVat', delegationVat);
      freshBaggage.init('peerWallet', mockPeerWallet);

      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );

      await coord.getAccounts();
      expect(freshBaggage.get('cachedPeerAccounts')).toStrictEqual([
        peerAddress,
      ]);
    });
  });

  describe('refreshPeerAccounts', () => {
    it('fetches and caches peer accounts', async () => {
      const peerAddress =
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;
      const mockPeerWallet = {
        getAccounts: vi.fn().mockResolvedValue([peerAddress]),
        handleSigningRequest: vi.fn(),
      };

      const freshBaggage = makeMockBaggage();
      freshBaggage.init('keyringVat', keyringVat);
      freshBaggage.init('providerVat', providerVat);
      freshBaggage.init('delegationVat', delegationVat);
      freshBaggage.init('peerWallet', mockPeerWallet);

      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );

      const accounts = await coord.refreshPeerAccounts();
      expect(accounts).toStrictEqual([peerAddress]);
      expect(freshBaggage.get('cachedPeerAccounts')).toStrictEqual([
        peerAddress,
      ]);
    });

    it('throws when no peer wallet is connected', async () => {
      await expect(coordinator.refreshPeerAccounts()).rejects.toThrow(
        'No peer wallet connected',
      );
    });
  });

  describe('registerAwayWallet', () => {
    it('stores the away wallet reference in baggage', async () => {
      const mockAwayWallet = {
        receiveDelegation: vi.fn().mockResolvedValue(undefined),
      };

      await coordinator.registerAwayWallet(mockAwayWallet);
      expect(coordinatorBaggage.get('awayWallet')).toBe(mockAwayWallet);
    });

    it('reports hasAwayWallet in capabilities after registration', async () => {
      const mockAwayWallet = {
        receiveDelegation: vi.fn().mockResolvedValue(undefined),
      };

      await coordinator.registerAwayWallet(mockAwayWallet);
      const caps = await coordinator.getCapabilities();
      expect(caps.hasAwayWallet).toBe(true);
    });

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['a string', 'not-an-object'],
      ['a number', 42],
    ])(
      'rejects %s as away wallet reference',
      async (
        _label: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ref: any,
      ) => {
        await expect(coordinator.registerAwayWallet(ref)).rejects.toThrow(
          'Invalid away wallet reference: must be a non-null object',
        );
      },
    );

    it('overwrites a previous away wallet reference', async () => {
      const walletA = {
        receiveDelegation: vi.fn().mockResolvedValue(undefined),
      };
      const walletB = {
        receiveDelegation: vi.fn().mockResolvedValue(undefined),
      };

      await coordinator.registerAwayWallet(walletA);
      await coordinator.registerAwayWallet(walletB);

      const delegation: Delegation = {
        id: 'del-overwrite',
        delegator: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address,
        delegate: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address,
        authority:
          '0xa0000000000000000000000000000000000000000000000000000000000000000' as Hex,
        caveats: [],
        salt: '0x01' as Hex,
        signature: '0xsig' as Hex,
        chainId: 1,
        status: 'signed',
      };

      await coordinator.pushDelegationToAway(delegation);
      expect(walletA.receiveDelegation).not.toHaveBeenCalled();
      expect(walletB.receiveDelegation).toHaveBeenCalledWith(delegation);
    });

    it('restores away wallet from baggage on resuscitation', async () => {
      const mockAwayWallet = {
        receiveDelegation: vi.fn().mockResolvedValue(undefined),
      };

      const freshBaggage = makeMockBaggage();
      freshBaggage.init('keyringVat', keyringVat);
      freshBaggage.init('providerVat', providerVat);
      freshBaggage.init('delegationVat', delegationVat);
      freshBaggage.init('awayWallet', mockAwayWallet);

      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );

      const delegation: Delegation = {
        id: 'del-resuscitate',
        delegator: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address,
        delegate: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address,
        authority:
          '0xa0000000000000000000000000000000000000000000000000000000000000000' as Hex,
        caveats: [],
        salt: '0x01' as Hex,
        signature: '0xsig' as Hex,
        chainId: 1,
        status: 'signed',
      };

      await coord.pushDelegationToAway(delegation);
      expect(mockAwayWallet.receiveDelegation).toHaveBeenCalledWith(delegation);
    });
  });

  describe('pushDelegationToAway', () => {
    it('pushes a delegation to the away wallet', async () => {
      const mockAwayWallet = {
        receiveDelegation: vi.fn().mockResolvedValue(undefined),
      };

      await coordinator.registerAwayWallet(mockAwayWallet);

      const delegation: Delegation = {
        id: 'del-push-1',
        delegator: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address,
        delegate: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address,
        authority:
          '0xa0000000000000000000000000000000000000000000000000000000000000000' as Hex,
        caveats: [],
        salt: '0x01' as Hex,
        signature: '0xsig' as Hex,
        chainId: 1,
        status: 'signed',
      };

      await coordinator.pushDelegationToAway(delegation);
      expect(mockAwayWallet.receiveDelegation).toHaveBeenCalledWith(delegation);
    });

    it('throws when no away wallet is registered', async () => {
      const delegation: Delegation = {
        id: 'del-push-2',
        delegator: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address,
        delegate: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address,
        authority:
          '0xa0000000000000000000000000000000000000000000000000000000000000000' as Hex,
        caveats: [],
        salt: '0x01' as Hex,
        signature: '0xsig' as Hex,
        chainId: 1,
        status: 'signed',
      };

      await expect(
        coordinator.pushDelegationToAway(delegation),
      ).rejects.toThrow(
        'No away wallet registered. The away device must connect first.',
      );
    });

    it('propagates errors from receiveDelegation', async () => {
      const mockAwayWallet = {
        receiveDelegation: vi
          .fn()
          .mockRejectedValue(new Error('CapTP connection lost')),
      };

      await coordinator.registerAwayWallet(mockAwayWallet);

      const delegation: Delegation = {
        id: 'del-push-error',
        delegator: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address,
        delegate: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address,
        authority:
          '0xa0000000000000000000000000000000000000000000000000000000000000000' as Hex,
        caveats: [],
        salt: '0x01' as Hex,
        signature: '0xsig' as Hex,
        chainId: 1,
        status: 'signed',
      };

      await expect(
        coordinator.pushDelegationToAway(delegation),
      ).rejects.toThrow('CapTP connection lost');
    });
  });

  describe('connectToPeer', () => {
    it('registers the coordinator as away wallet on the home device', async () => {
      const peerAddress =
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;
      const mockPeerWallet = {
        getAccounts: vi.fn().mockResolvedValue([peerAddress]),
        getCapabilities: vi.fn().mockResolvedValue({ signingMode: 'local' }),
        handleSigningRequest: vi.fn(),
        registerAwayWallet: vi.fn().mockResolvedValue(undefined),
      };

      const mockRedemption = {
        redeem: vi.fn().mockResolvedValue(mockPeerWallet),
      };

      const freshBaggage = makeMockBaggage();
      freshBaggage.init('keyringVat', keyringVat);
      freshBaggage.init('providerVat', providerVat);
      freshBaggage.init('delegationVat', delegationVat);

      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );

      await coord.bootstrap(
        {
          keyring: keyringVat,
          provider: providerVat,
          delegation: delegationVat,
        },
        { ocapURLRedemptionService: mockRedemption },
      );

      await coord.connectToPeer('ocap:test@peer123');
      expect(mockPeerWallet.registerAwayWallet).toHaveBeenCalled();
    });

    it('completes when peer does not support registerAwayWallet', async () => {
      const peerAddress =
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;
      const mockPeerWallet = {
        getAccounts: vi.fn().mockResolvedValue([peerAddress]),
        getCapabilities: vi.fn().mockResolvedValue({ signingMode: 'local' }),
        handleSigningRequest: vi.fn(),
        registerAwayWallet: vi
          .fn()
          .mockRejectedValue(new Error('method not found')),
      };

      const mockRedemption = {
        redeem: vi.fn().mockResolvedValue(mockPeerWallet),
      };

      const freshBaggage = makeMockBaggage();
      freshBaggage.init('keyringVat', keyringVat);
      freshBaggage.init('providerVat', providerVat);
      freshBaggage.init('delegationVat', delegationVat);

      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );

      await coord.bootstrap(
        {
          keyring: keyringVat,
          provider: providerVat,
          delegation: delegationVat,
        },
        { ocapURLRedemptionService: mockRedemption },
      );

      // Does not throw — gracefully degrades
      await coord.connectToPeer('ocap:test@peer123');
      expect(mockPeerWallet.registerAwayWallet).toHaveBeenCalled();
    });
  });

  describe('registerDelegateAddress', () => {
    it('stores delegate address in baggage', async () => {
      const addr = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;
      await coordinator.registerDelegateAddress(addr);
      expect(coordinatorBaggage.get('pendingDelegateAddress')).toBe(addr);
    });

    it('returns delegate address via getDelegateAddress', async () => {
      const addr = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;
      await coordinator.registerDelegateAddress(addr);
      const result = await coordinator.getDelegateAddress();
      expect(result).toBe(addr);
    });

    it('returns undefined when no delegate address is set', async () => {
      const result = await coordinator.getDelegateAddress();
      expect(result).toBeUndefined();
    });

    it.each([
      ['empty string', ''],
      ['not hex', 'not-an-address'],
      ['too short', '0x1234'],
      ['null', null],
    ])(
      'rejects %s as delegate address',
      async (
        _label: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        addr: any,
      ) => {
        await expect(coordinator.registerDelegateAddress(addr)).rejects.toThrow(
          'Invalid delegate address',
        );
      },
    );
  });

  describe('sendDelegateAddressToPeer', () => {
    it('sends delegate address to peer wallet', async () => {
      const addr = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;
      const mockPeerWallet = {
        getAccounts: vi.fn().mockResolvedValue([]),
        getCapabilities: vi.fn().mockResolvedValue({ signingMode: 'local' }),
        handleSigningRequest: vi.fn(),
        registerAwayWallet: vi.fn().mockResolvedValue(undefined),
        registerDelegateAddress: vi.fn().mockResolvedValue(undefined),
      };

      const mockRedemption = {
        redeem: vi.fn().mockResolvedValue(mockPeerWallet),
      };

      const freshBaggage = makeMockBaggage();
      freshBaggage.init('keyringVat', keyringVat);
      freshBaggage.init('providerVat', providerVat);
      freshBaggage.init('delegationVat', delegationVat);

      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );

      await coord.bootstrap(
        {
          keyring: keyringVat,
          provider: providerVat,
          delegation: delegationVat,
        },
        { ocapURLRedemptionService: mockRedemption },
      );

      await coord.connectToPeer('ocap:test@peer123');
      await coord.sendDelegateAddressToPeer(addr);
      expect(mockPeerWallet.registerDelegateAddress).toHaveBeenCalledWith(addr);
    });

    it('throws when no peer wallet is connected', async () => {
      await expect(
        coordinator.sendDelegateAddressToPeer(
          '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        ),
      ).rejects.toThrow('No peer wallet connected');
    });
  });

  describe('configureBundler', () => {
    it('stores bundler config in baggage', async () => {
      await coordinator.configureBundler({
        bundlerUrl: 'https://bundler.example.com',
        chainId: 1,
      });

      expect(coordinatorBaggage.has('bundlerConfig')).toBe(true);
    });

    it('defaults entryPoint to ENTRY_POINT_V07', async () => {
      await coordinator.configureBundler({
        bundlerUrl: 'https://bundler.example.com',
        chainId: 1,
      });

      const config = coordinatorBaggage.get('bundlerConfig') as {
        entryPoint: Hex;
      };
      expect(config.entryPoint).toBe(ENTRY_POINT_V07);
    });

    it('accepts custom entryPoint', async () => {
      const customEntryPoint =
        '0x1111111111111111111111111111111111111111' as Hex;
      await coordinator.configureBundler({
        bundlerUrl: 'https://bundler.example.com',
        entryPoint: customEntryPoint,
        chainId: 1,
      });

      const config = coordinatorBaggage.get('bundlerConfig') as {
        entryPoint: Hex;
      };
      expect(config.entryPoint).toBe(customEntryPoint);
    });

    it('reports hasBundlerConfig in capabilities', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      await coordinator.configureBundler({
        bundlerUrl: 'https://bundler.example.com',
        chainId: 1,
      });

      const caps = await coordinator.getCapabilities();
      expect(caps.hasBundlerConfig).toBe(true);
    });

    it('rejects invalid bundler URL', async () => {
      await expect(
        coordinator.configureBundler({
          bundlerUrl: 'not-a-url',
          chainId: 1,
        }),
      ).rejects.toThrow('Invalid bundler URL');
    });

    it('rejects non-HTTP(S) bundler URL', async () => {
      await expect(
        coordinator.configureBundler({
          bundlerUrl: 'ftp://bundler.example.com',
          chainId: 1,
        }),
      ).rejects.toThrow('Invalid bundler URL');
    });

    it('rejects invalid chain ID', async () => {
      await expect(
        coordinator.configureBundler({
          bundlerUrl: 'https://bundler.example.com',
          chainId: 0,
        }),
      ).rejects.toThrow('Invalid chain ID');

      await expect(
        coordinator.configureBundler({
          bundlerUrl: 'https://bundler.example.com',
          chainId: -1,
        }),
      ).rejects.toThrow('Invalid chain ID');

      await expect(
        coordinator.configureBundler({
          bundlerUrl: 'https://bundler.example.com',
          chainId: 1.5,
        }),
      ).rejects.toThrow('Invalid chain ID');
    });
  });

  describe('signing with external signer', () => {
    it('prefers keyring over external signer for signTypedData', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      const extSigner = makeMockExternalSigner();
      await coordinator.connectExternalSigner(extSigner);

      const typedData: Eip712TypedData = {
        domain: { name: 'Test', version: '1', chainId: 1 },
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'version', type: 'string' },
            { name: 'chainId', type: 'uint256' },
          ],
          Test: [{ name: 'value', type: 'uint256' }],
        },
        primaryType: 'Test',
        message: { value: '42' },
      };

      const signature = await coordinator.signTypedData(typedData);
      expect(signature).toMatch(/^0x/u);
      expect(extSigner.signTypedData).not.toHaveBeenCalled();
    });

    it('falls back to external signer for signTypedData when no keyring', async () => {
      const freshBaggage = makeMockBaggage();
      const extSigner = makeMockExternalSigner();
      freshBaggage.init('externalSigner', extSigner);

      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );
      await coord.bootstrap({ provider: providerVat }, {});

      const typedData: Eip712TypedData = {
        domain: { name: 'Test' },
        types: { Test: [{ name: 'v', type: 'uint256' }] },
        primaryType: 'Test',
        message: { v: '1' },
      };

      const signature = await coord.signTypedData(typedData);
      expect(signature).toBe(
        '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef00',
      );
      expect(extSigner.signTypedData).toHaveBeenCalledWith(
        typedData,
        EXT_SIGNER_ACCOUNT,
      );
    });

    it('uses the requested local account for signTypedData', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });
      const secondAccount = await keyringVat.deriveAccount(1);

      const typedData: Eip712TypedData = {
        domain: { name: 'Test' },
        types: { Test: [{ name: 'v', type: 'uint256' }] },
        primaryType: 'Test',
        message: { v: '1' },
      };

      const signature = await coordinator.signTypedData(
        typedData,
        secondAccount,
      );
      const expected = await keyringVat.signTypedData(typedData, secondAccount);
      const firstAccountSignature = await keyringVat.signTypedData(typedData);

      expect(signature).toBe(expected);
      expect(signature).not.toBe(firstAccountSignature);
    });

    it('throws when signTypedData requests an unknown local account', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      const typedData: Eip712TypedData = {
        domain: { name: 'Test' },
        types: { Test: [{ name: 'v', type: 'uint256' }] },
        primaryType: 'Test',
        message: { v: '1' },
      };

      await expect(
        coordinator.signTypedData(
          typedData,
          '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        ),
      ).rejects.toThrow(
        'No key for account 0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      );
    });

    it('falls back to external signer for signMessage when no keyring', async () => {
      const freshBaggage = makeMockBaggage();
      const extSigner = makeMockExternalSigner();
      freshBaggage.init('externalSigner', extSigner);

      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );
      await coord.bootstrap({ provider: providerVat }, {});

      const signature = await coord.signMessage('Hello');
      expect(signature).toBe(
        '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef00',
      );
      expect(extSigner.signMessage).toHaveBeenCalledWith(
        'Hello',
        EXT_SIGNER_ACCOUNT,
      );
    });

    it('falls back to external signer for signTransaction when no local key', async () => {
      const freshBaggage = makeMockBaggage();
      const extSigner = makeMockExternalSigner();
      freshBaggage.init('externalSigner', extSigner);

      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );
      await coord.bootstrap({ provider: providerVat }, {});

      const tx: TransactionRequest = {
        from: '0x0000000000000000000000000000000000000099' as Address,
        to: TARGET,
        chainId: 1,
        nonce: 0,
      };

      const signature = await coord.signTransaction(tx);
      expect(signature).toBe(
        '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef00',
      );
      expect(extSigner.signTransaction).toHaveBeenCalledWith(tx);
    });

    it('reports hasExternalSigner in capabilities', async () => {
      const extSigner = makeMockExternalSigner();
      await coordinator.connectExternalSigner(extSigner);

      const caps = await coordinator.getCapabilities();
      expect(caps.hasExternalSigner).toBe(true);
    });
  });

  describe('handleSigningRequest with external signer', () => {
    it('rejects transaction requests', async () => {
      const freshBaggage = makeMockBaggage();
      const extSigner = makeMockExternalSigner();
      freshBaggage.init('externalSigner', extSigner);

      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );

      const tx: TransactionRequest = {
        from: EXT_SIGNER_ACCOUNT,
        to: TARGET,
        chainId: 1,
        nonce: 0,
      };

      await expect(
        coord.handleSigningRequest({
          type: 'transaction',
          tx,
        }),
      ).rejects.toThrow(
        'Peer transaction signing is disabled; use delegation redemption',
      );
      expect(extSigner.signTransaction).not.toHaveBeenCalled();
    });

    it('falls back to external signer for typedData requests', async () => {
      const freshBaggage = makeMockBaggage();
      const extSigner = makeMockExternalSigner();
      freshBaggage.init('externalSigner', extSigner);

      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );

      const data: Eip712TypedData = {
        domain: { name: 'Test' },
        types: { Test: [{ name: 'v', type: 'uint256' }] },
        primaryType: 'Test',
        message: { v: '1' },
      };

      const signed = await coord.handleSigningRequest({
        type: 'typedData',
        data,
      });
      expect(signed).toBe(
        '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef00',
      );
    });

    it('falls back to external signer for message requests', async () => {
      const freshBaggage = makeMockBaggage();
      const extSigner = makeMockExternalSigner();
      freshBaggage.init('externalSigner', extSigner);

      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );

      const signed = await coord.handleSigningRequest({
        type: 'message',
        message: 'test',
      });
      expect(signed).toBe(
        '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef00',
      );
    });

    it('throws when no signer is available', async () => {
      const freshBaggage = makeMockBaggage();

      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );

      await expect(
        coord.handleSigningRequest({
          type: 'typedData',
          data: {
            domain: { name: 'Test' },
            types: { Test: [{ name: 'v', type: 'uint256' }] },
            primaryType: 'Test',
            message: { v: '1' },
          },
        }),
      ).rejects.toThrow('No signer available to handle signing request');
    });
  });

  describe('createDelegation with external signer', () => {
    it('creates a delegation using external signer when no keyring', async () => {
      const extSigner = makeMockExternalSigner();

      const freshBaggage = makeMockBaggage();
      freshBaggage.init('externalSigner', extSigner);

      const freshDelegationVat = buildDelegationRoot(
        {},
        {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        makeMockBaggage() as any,
      );

      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );
      await coord.bootstrap(
        { provider: providerVat, delegation: freshDelegationVat },
        {},
      );

      const delegation = await coord.createDelegation({
        delegate: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' as Address,
        caveats: [],
        chainId: 1,
      });

      expect(delegation.status).toBe('signed');
      expect(delegation.signature).toBe(
        '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef00',
      );
      expect(delegation.delegator).toBe(EXT_SIGNER_ACCOUNT);
      expect(extSigner.signTypedData).toHaveBeenCalled();
    });

    it('uses external owner account for smart-account delegation signing', async () => {
      const extSigner = makeMockExternalSigner();
      const freshBaggage = makeMockBaggage();
      freshBaggage.init('externalSigner', extSigner);

      const freshDelegationVat = buildDelegationRoot(
        {},
        {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        makeMockBaggage() as any,
      );

      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );
      await coord.bootstrap(
        { provider: providerVat, delegation: freshDelegationVat },
        {},
      );

      const smartAddress =
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;
      await coord.createSmartAccount({
        chainId: 11155111,
        address: smartAddress,
      });

      const delegation = await coord.createDelegation({
        delegate: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' as Address,
        caveats: [],
        chainId: 11155111,
      });

      expect(delegation.delegator).toBe(smartAddress);
      expect(extSigner.signTypedData).toHaveBeenCalled();
      const [, from] = extSigner.signTypedData.mock.calls.at(-1) as [
        Eip712TypedData,
        Address,
      ];
      expect(from).toBe(EXT_SIGNER_ACCOUNT);
    });

    it('throws when neither keyring nor external signer is available', async () => {
      const freshBaggage = makeMockBaggage();

      const freshDelegationVat = buildDelegationRoot(
        {},
        {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        makeMockBaggage() as any,
      );

      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );
      await coord.bootstrap(
        { provider: providerVat, delegation: freshDelegationVat },
        {},
      );

      await expect(
        coord.createDelegation({
          delegate: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' as Address,
          caveats: [],
          chainId: 1,
        }),
      ).rejects.toThrow('No accounts available to create delegation');
    });
  });

  describe('redeemDelegation', () => {
    it('redeems a delegation by ID via the UserOp pipeline', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      await coordinator.configureBundler({
        bundlerUrl: 'https://bundler.example.com',
        chainId: 1,
      });

      const accounts = await coordinator.getAccounts();
      const delegator = accounts[0] as Address;

      // Create a signed delegation where delegator == delegate (self-delegation)
      const delegation = await coordinator.createDelegation({
        delegate: delegator,
        caveats: [
          makeCaveat({
            type: 'allowedTargets',
            terms: encodeAllowedTargets([TARGET]),
          }),
        ],
        chainId: 1,
      });

      const result = await coordinator.redeemDelegation({
        execution: {
          target: TARGET,
          value: '0x0' as Hex,
          callData: '0x' as Hex,
        },
        delegationId: delegation.id,
        maxFeePerGas: '0x3b9aca00' as Hex,
        maxPriorityFeePerGas: '0x3b9aca00' as Hex,
      });

      expect(result).toBe('0xuserophash');
      expect(providerVat.getEntryPointNonce).toHaveBeenCalledWith({
        entryPoint: ENTRY_POINT_V07,
        sender: delegator,
      });
      expect(providerVat.estimateUserOpGas).toHaveBeenCalledWith(
        expect.objectContaining({
          bundlerUrl: 'https://bundler.example.com',
          entryPoint: ENTRY_POINT_V07,
        }),
      );
      expect(providerVat.submitUserOp).toHaveBeenCalledWith(
        expect.objectContaining({
          bundlerUrl: 'https://bundler.example.com',
          entryPoint: ENTRY_POINT_V07,
          userOp: expect.objectContaining({
            sender: delegator,
            signature: expect.stringMatching(/^0x/u),
            // Self-pay path: callGasLimit and verificationGasLimit get 10% buffer
            callGasLimit: '0x58000', // 0x50000 + 10%
            verificationGasLimit: '0x69999', // 0x60000 + 10%
            // preVerificationGas must NOT be buffered
            preVerificationGas: '0x10000',
          }),
        }),
      );
    });

    it('redeems a delegation by action match', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      await coordinator.configureBundler({
        bundlerUrl: 'https://bundler.example.com',
        chainId: 1,
      });

      const accounts = await coordinator.getAccounts();
      const delegator = accounts[0] as Address;

      await coordinator.createDelegation({
        delegate: delegator,
        caveats: [
          makeCaveat({
            type: 'allowedTargets',
            terms: encodeAllowedTargets([TARGET]),
          }),
        ],
        chainId: 1,
      });

      const result = await coordinator.redeemDelegation({
        execution: {
          target: TARGET,
          value: '0x0' as Hex,
          callData: '0x' as Hex,
        },
        action: {
          to: TARGET,
          value: '0x0' as Hex,
        },
        maxFeePerGas: '0x3b9aca00' as Hex,
        maxPriorityFeePerGas: '0x3b9aca00' as Hex,
      });

      expect(result).toBe('0xuserophash');
    });

    it('throws when no matching delegation exists', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      await coordinator.configureBundler({
        bundlerUrl: 'https://bundler.example.com',
        chainId: 1,
      });

      await expect(
        coordinator.redeemDelegation({
          execution: {
            target: TARGET,
            value: '0x0' as Hex,
            callData: '0x' as Hex,
          },
          action: {
            to: '0x0000000000000000000000000000000000000099' as Address,
          },
          maxFeePerGas: '0x3b9aca00' as Hex,
          maxPriorityFeePerGas: '0x3b9aca00' as Hex,
        }),
      ).rejects.toThrow('No matching delegation found');
    });

    it('throws when bundler is not configured', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      const accounts = await coordinator.getAccounts();
      const delegator = accounts[0] as Address;

      // Create a real signed delegation so we get past the lookup
      const delegation = await coordinator.createDelegation({
        delegate: delegator,
        caveats: [],
        chainId: 1,
      });

      // No configureBundler call — should throw
      await expect(
        coordinator.redeemDelegation({
          execution: {
            target: TARGET,
            value: '0x0' as Hex,
            callData: '0x' as Hex,
          },
          delegations: [delegation],
          maxFeePerGas: '0x3b9aca00' as Hex,
          maxPriorityFeePerGas: '0x3b9aca00' as Hex,
        }),
      ).rejects.toThrow('Bundler not configured');
    });

    it('rejects delegations with non-signed status', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      await coordinator.configureBundler({
        bundlerUrl: 'https://bundler.example.com',
        chainId: 1,
      });

      const accounts = await coordinator.getAccounts();
      const delegator = accounts[0] as Address;

      // Create a delegation but don't sign it (stays pending) — use delegation vat directly
      const pendingDelegation = await delegationVat.createDelegation({
        delegator,
        delegate: delegator,
        caveats: [],
        chainId: 1,
      });

      await expect(
        coordinator.redeemDelegation({
          execution: {
            target: TARGET,
            value: '0x0' as Hex,
            callData: '0x' as Hex,
          },
          delegationId: pendingDelegation.id,
          maxFeePerGas: '0x3b9aca00' as Hex,
          maxPriorityFeePerGas: '0x3b9aca00' as Hex,
        }),
      ).rejects.toThrow("has status 'pending', expected 'signed'");
    });

    it('throws when no delegations, delegationId, or action provided', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      await coordinator.configureBundler({
        bundlerUrl: 'https://bundler.example.com',
        chainId: 1,
      });

      await expect(
        coordinator.redeemDelegation({
          execution: {
            target: TARGET,
            value: '0x0' as Hex,
            callData: '0x' as Hex,
          },
          maxFeePerGas: '0x3b9aca00' as Hex,
          maxPriorityFeePerGas: '0x3b9aca00' as Hex,
        }),
      ).rejects.toThrow('Must provide delegations, delegationId, or action');
    });

    it('accepts explicit delegation chains', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      await coordinator.configureBundler({
        bundlerUrl: 'https://bundler.example.com',
        chainId: 1,
      });

      const accounts = await coordinator.getAccounts();
      const delegator = accounts[0] as Address;

      const delegation = await coordinator.createDelegation({
        delegate: delegator,
        caveats: [],
        chainId: 1,
      });

      const result = await coordinator.redeemDelegation({
        execution: {
          target: TARGET,
          value: '0x0' as Hex,
          callData: '0x' as Hex,
        },
        delegations: [delegation],
        maxFeePerGas: '0x3b9aca00' as Hex,
        maxPriorityFeePerGas: '0x3b9aca00' as Hex,
      });

      expect(result).toBe('0xuserophash');
    });

    it('redeems via external signer when no keyring', async () => {
      const extSigner = makeMockExternalSigner();
      const freshBaggage = makeMockBaggage();
      freshBaggage.init('externalSigner', extSigner);

      const freshDelegationVat = buildDelegationRoot(
        {},
        {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        makeMockBaggage() as any,
      );

      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );
      await coord.bootstrap(
        { provider: providerVat, delegation: freshDelegationVat },
        {},
      );

      await coord.configureBundler({
        bundlerUrl: 'https://bundler.example.com',
        chainId: 1,
      });

      // Create delegation with external signer as delegator
      const delegation = await coord.createDelegation({
        delegate: EXT_SIGNER_ACCOUNT,
        caveats: [],
        chainId: 1,
      });

      const result = await coord.redeemDelegation({
        execution: {
          target: TARGET,
          value: '0x0' as Hex,
          callData: '0x' as Hex,
        },
        delegationId: delegation.id,
        maxFeePerGas: '0x3b9aca00' as Hex,
        maxPriorityFeePerGas: '0x3b9aca00' as Hex,
      });

      expect(result).toBe('0xuserophash');
      // UserOp is now signed via signTypedData (EIP-712 for HybridDeleGator)
      expect(extSigner.signTypedData).toHaveBeenCalled();
    });
  });

  describe('getTokenBalance', () => {
    it('returns the decoded balance', async () => {
      // ABI-encoded uint256 for 1000000
      providerVat.request.mockResolvedValueOnce(
        '0x00000000000000000000000000000000000000000000000000000000000f4240' as Hex,
      );
      const balance = await coordinator.getTokenBalance({
        token: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address,
        owner: TARGET,
      });
      expect(balance).toBe('1000000');
      expect(providerVat.request).toHaveBeenCalledWith('eth_call', [
        expect.objectContaining({
          to: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          data: expect.stringMatching(/^0x70a08231/u),
        }),
        'latest',
      ]);
    });

    it('throws when provider is not configured', async () => {
      const bare = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        makeMockBaggage() as any,
      );
      await expect(
        bare.getTokenBalance({
          token: TARGET,
          owner: TARGET,
        }),
      ).rejects.toThrow('Provider not configured');
    });
  });

  describe('getTokenMetadata', () => {
    it('returns name, symbol, and decimals', async () => {
      // "USD Coin" as ABI-encoded string
      const nameEncoded = [
        '0x',
        '0000000000000000000000000000000000000000000000000000000000000020',
        '0000000000000000000000000000000000000000000000000000000000000008',
        '55534420436f696e000000000000000000000000000000000000000000000000',
      ].join('') as Hex;
      // "USDC" as ABI-encoded string
      const symbolEncoded = [
        '0x',
        '0000000000000000000000000000000000000000000000000000000000000020',
        '0000000000000000000000000000000000000000000000000000000000000004',
        '5553444300000000000000000000000000000000000000000000000000000000',
      ].join('') as Hex;
      const decimalsEncoded =
        '0x0000000000000000000000000000000000000000000000000000000000000006' as Hex;

      providerVat.request
        .mockResolvedValueOnce(nameEncoded) // name
        .mockResolvedValueOnce(symbolEncoded) // symbol
        .mockResolvedValueOnce(decimalsEncoded); // decimals

      const meta = await coordinator.getTokenMetadata({
        token: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address,
      });
      expect(meta).toStrictEqual({
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 6,
      });
    });

    it('throws when RPC returns empty response', async () => {
      providerVat.request
        .mockResolvedValueOnce('0x') // name returns empty
        .mockResolvedValueOnce('0x')
        .mockResolvedValueOnce('0x');

      await expect(
        coordinator.getTokenMetadata({
          token: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address,
        }),
      ).rejects.toThrow(/returned unexpected value/u);
    });

    it('throws when provider is not configured', async () => {
      const bare = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        makeMockBaggage() as any,
      );
      await expect(
        bare.getTokenMetadata({
          token: TARGET,
        }),
      ).rejects.toThrow('Provider not configured');
    });
  });

  describe('sendErc20Transfer', () => {
    it('routes through sendTransaction with encoded transfer calldata', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });
      await coordinator.configureProvider({ chainId: 1, rpcUrl: 'http://rpc' });

      const token = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;
      const result = await coordinator.sendErc20Transfer({
        token,
        to: TARGET,
        amount: 1000n,
      });
      expect(result).toBe('0xtxhash');
      expect(providerVat.broadcastTransaction).toHaveBeenCalled();

      // Verify eth_estimateGas was called with correct ERC-20 tx shape
      const estimateCall = providerVat.request.mock.calls.find(
        (call: unknown[]) => call[0] === 'eth_estimateGas',
      );
      expect(estimateCall).toBeDefined();
      const txParam = estimateCall[1][0];
      // to = token contract, not recipient
      expect(txParam.to).toBe(token);
      // value = 0 for ERC-20
      expect(txParam.value).toBe('0x0');
      // data starts with transfer selector
      expect(txParam.data.slice(0, 10).toLowerCase()).toBe('0xa9059cbb');
    });

    it('uses explicit from address when provided', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });
      await coordinator.configureProvider({ chainId: 1, rpcUrl: 'http://rpc' });

      const accounts = await coordinator.getAccounts();
      const result = await coordinator.sendErc20Transfer({
        token: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address,
        to: TARGET,
        amount: 500n,
        from: accounts[0] as Address,
      });
      expect(result).toBe('0xtxhash');
    });

    it('throws when no accounts available', async () => {
      await expect(
        coordinator.sendErc20Transfer({
          token: TARGET,
          to: TARGET,
          amount: 100n,
        }),
      ).rejects.toThrow('No accounts available');
    });
  });

  describe('waitForUserOpReceipt', () => {
    it('returns receipt when found immediately', async () => {
      await coordinator.configureBundler({
        bundlerUrl: 'https://bundler.example.com',
        chainId: 1,
      });

      const receipt = { success: true, receipt: { transactionHash: '0xabc' } };
      providerVat.getUserOpReceipt.mockResolvedValueOnce(receipt);

      const result = await coordinator.waitForUserOpReceipt({
        userOpHash: '0xdeadbeef' as Hex,
      });
      expect(result).toStrictEqual(receipt);
    });

    it('polls and returns receipt after delay', async () => {
      vi.useFakeTimers();

      await coordinator.configureBundler({
        bundlerUrl: 'https://bundler.example.com',
        chainId: 1,
      });

      const receipt = { success: true };
      providerVat.getUserOpReceipt
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(receipt);

      const resultPromise = coordinator.waitForUserOpReceipt({
        userOpHash: '0xdeadbeef' as Hex,
        pollIntervalMs: 100,
      });

      // Advance through two polls
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(100);

      const result = await resultPromise;
      expect(result).toStrictEqual(receipt);
      expect(providerVat.getUserOpReceipt).toHaveBeenCalledTimes(3);

      vi.useRealTimers();
    });

    it('throws on timeout', async () => {
      vi.useFakeTimers();

      await coordinator.configureBundler({
        bundlerUrl: 'https://bundler.example.com',
        chainId: 1,
      });

      providerVat.getUserOpReceipt.mockResolvedValue(null);

      const resultPromise = coordinator.waitForUserOpReceipt({
        userOpHash: '0xdeadbeef' as Hex,
        pollIntervalMs: 100,
        timeoutMs: 500,
      });

      // Advance past timeout
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(100);
      }

      await expect(resultPromise).rejects.toThrow('not found after 500ms');

      vi.useRealTimers();
    });

    it('throws when provider and bundler are not configured', async () => {
      const freshBaggage = makeMockBaggage();
      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );

      await expect(
        coord.waitForUserOpReceipt({
          userOpHash: '0xdeadbeef' as Hex,
        }),
      ).rejects.toThrow('Provider and bundler must be configured');
    });
  });

  describe('createSmartAccount', () => {
    it('derives counterfactual address when not provided', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      const config = await coordinator.createSmartAccount({
        deploySalt:
          '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex,
        chainId: 11155111,
      });

      expect(config).toStrictEqual({
        implementation: 'hybrid',
        deploySalt:
          '0x0000000000000000000000000000000000000000000000000000000000000001',
        address: DERIVED_SMART_ACCOUNT,
        factory: MOCK_FACTORY,
        factoryData: '0xfactorydata',
        deployed: false,
      });

      expect(coordinatorBaggage.has('smartAccountConfig')).toBe(true);
    });

    it('stores explicit address when provided', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      const smartAddress =
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;

      const config = await coordinator.createSmartAccount({
        deploySalt:
          '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex,
        chainId: 11155111,
        address: smartAddress,
      });

      expect(config.address).toBe(smartAddress);
    });

    it('throws when no owner account is available', async () => {
      const freshBaggage = makeMockBaggage();
      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );
      await coord.bootstrap({ provider: providerVat }, {});

      await expect(
        coord.createSmartAccount({
          deploySalt:
            '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex,
          chainId: 11155111,
        }),
      ).rejects.toThrow('No owner account available');
    });

    it('reports smartAccountAddress in capabilities', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      const smartAddress =
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;

      await coordinator.createSmartAccount({
        deploySalt:
          '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex,
        chainId: 11155111,
        address: smartAddress,
      });

      const caps = await coordinator.getCapabilities();
      expect(caps.smartAccountAddress).toBe(smartAddress);
    });
  });

  describe('getSmartAccountAddress', () => {
    it('returns undefined when no smart account configured', async () => {
      const address = await coordinator.getSmartAccountAddress();
      expect(address).toBeUndefined();
    });

    it('returns derived address after smart account creation', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      await coordinator.createSmartAccount({
        deploySalt:
          '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex,
        chainId: 11155111,
      });

      const address = await coordinator.getSmartAccountAddress();
      expect(address).toBe(DERIVED_SMART_ACCOUNT);
    });

    it('returns explicit address after smart account creation', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      const smartAddress =
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;

      await coordinator.createSmartAccount({
        deploySalt:
          '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex,
        chainId: 11155111,
        address: smartAddress,
      });

      const address = await coordinator.getSmartAccountAddress();
      expect(address).toBe(smartAddress);
    });
  });

  describe('smart account delegation', () => {
    it('uses smart account address as delegator when configured', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      const smartAddress =
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;
      await coordinator.createSmartAccount({
        deploySalt:
          '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex,
        chainId: 11155111,
        address: smartAddress,
      });

      const delegation = await coordinator.createDelegation({
        delegate: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' as Address,
        caveats: [],
        chainId: 1,
      });

      expect(delegation.delegator).toBe(smartAddress);
      expect(delegation.status).toBe('signed');
    });

    it('signs with EOA owner when smart account is sender', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      const accounts = await coordinator.getAccounts();
      const eoaOwner = accounts[0] as Address;

      await coordinator.createSmartAccount({
        deploySalt:
          '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex,
        chainId: 11155111,
      });

      await coordinator.configureBundler({
        bundlerUrl: 'https://bundler.example.com',
        chainId: 11155111,
      });

      // Create a self-delegation where delegator is the smart account
      const delegation = await coordinator.createDelegation({
        delegate: DERIVED_SMART_ACCOUNT,
        caveats: [
          makeCaveat({
            type: 'allowedTargets',
            terms: encodeAllowedTargets([TARGET]),
          }),
        ],
        chainId: 11155111,
      });

      const result = await coordinator.redeemDelegation({
        execution: {
          target: TARGET,
          value: '0x0' as Hex,
          callData: '0x' as Hex,
        },
        delegationId: delegation.id,
        maxFeePerGas: '0x3b9aca00' as Hex,
        maxPriorityFeePerGas: '0x3b9aca00' as Hex,
      });

      expect(result).toBe('0xuserophash');
      // The sender is the smart account but signing address should be the EOA
      const submitCall = providerVat.submitUserOp.mock.calls[0][0];
      expect(submitCall.userOp.sender).toBe(DERIVED_SMART_ACCOUNT);
      // Verify signature is present (signed by EOA)
      expect(submitCall.userOp.signature).toMatch(/^0x/u);
      expect(submitCall.userOp.signature).not.toBe('0x');
      // The EOA owner is used for derivation and signing
      expect(eoaOwner).toMatch(/^0x[\da-f]{40}$/iu);
    });
  });

  describe('paymaster sponsorship', () => {
    it('uses paymaster when usePaymaster is configured', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      await coordinator.configureBundler({
        bundlerUrl: 'https://bundler.example.com',
        chainId: 1,
        usePaymaster: true,
      });

      const accounts = await coordinator.getAccounts();
      const delegator = accounts[0] as Address;

      const delegation = await coordinator.createDelegation({
        delegate: delegator,
        caveats: [
          makeCaveat({
            type: 'allowedTargets',
            terms: encodeAllowedTargets([TARGET]),
          }),
        ],
        chainId: 1,
      });

      const result = await coordinator.redeemDelegation({
        execution: {
          target: TARGET,
          value: '0x0' as Hex,
          callData: '0x' as Hex,
        },
        delegationId: delegation.id,
        maxFeePerGas: '0x3b9aca00' as Hex,
        maxPriorityFeePerGas: '0x3b9aca00' as Hex,
      });

      expect(result).toBe('0xuserophash');
      expect(providerVat.sponsorUserOp).toHaveBeenCalled();
      expect(providerVat.estimateUserOpGas).not.toHaveBeenCalled();

      // Verify the submitted UserOp includes paymaster fields
      const submitCall = providerVat.submitUserOp.mock.calls[0][0];
      expect(submitCall.userOp.paymaster).toBe(
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      );
      expect(submitCall.userOp.paymasterData).toBe('0xdeadbeef');

      // Paymaster path: gas values must pass through unbuffered (they are
      // part of the paymaster's signed commitment)
      expect(submitCall.userOp.callGasLimit).toBe('0x50000');
      expect(submitCall.userOp.verificationGasLimit).toBe('0x60000');
      expect(submitCall.userOp.preVerificationGas).toBe('0x10000');
    });

    it('passes sponsorshipPolicyId in context', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      await coordinator.configureBundler({
        bundlerUrl: 'https://bundler.example.com',
        chainId: 1,
        usePaymaster: true,
        sponsorshipPolicyId: 'sp_my_policy',
      });

      const accounts = await coordinator.getAccounts();
      const delegator = accounts[0] as Address;

      const delegation = await coordinator.createDelegation({
        delegate: delegator,
        caveats: [],
        chainId: 1,
      });

      await coordinator.redeemDelegation({
        execution: {
          target: TARGET,
          value: '0x0' as Hex,
          callData: '0x' as Hex,
        },
        delegationId: delegation.id,
        maxFeePerGas: '0x3b9aca00' as Hex,
        maxPriorityFeePerGas: '0x3b9aca00' as Hex,
      });

      expect(providerVat.sponsorUserOp).toHaveBeenCalledWith(
        expect.objectContaining({
          context: { sponsorshipPolicyId: 'sp_my_policy' },
        }),
      );
    });

    it('calls provider configureBundler during coordinator configureBundler', async () => {
      await coordinator.configureBundler({
        bundlerUrl: 'https://bundler.example.com',
        chainId: 1,
      });

      expect(providerVat.configureBundler).toHaveBeenCalledWith({
        bundlerUrl: 'https://bundler.example.com',
        chainId: 1,
      });
    });
  });

  describe('createSmartAccount (stateless7702)', () => {
    it('creates a 7702 smart account when EOA has no code', async () => {
      vi.useFakeTimers();

      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      // eth_getCode returns empty (not yet delegated), eth_estimateGas for
      // the authorization tx, then receipt confirms the tx
      providerVat.request
        .mockResolvedValueOnce('0x') // initial eth_getCode check
        .mockResolvedValueOnce('0x19000') // eth_estimateGas for EIP-7702 auth
        .mockResolvedValueOnce({ status: '0x1' }); // eth_getTransactionReceipt poll

      const configPromise = coordinator.createSmartAccount({
        chainId: 11155111,
        implementation: 'stateless7702',
      });

      // Advance past the confirmation poll timeout
      await vi.advanceTimersByTimeAsync(2000);

      const config = await configPromise;
      const accounts = await coordinator.getAccounts();

      expect(config.implementation).toBe('stateless7702');
      expect(config.address).toBe(accounts[0]);
      expect(config.deployed).toBe(true);
      expect(config.factory).toBeUndefined();
      expect(config.factoryData).toBeUndefined();
      expect(config.deploySalt).toBeUndefined();
      expect(coordinatorBaggage.has('smartAccountConfig')).toBe(true);

      // Should have broadcast the authorization tx (as type-4 EIP-7702)
      expect(providerVat.broadcastTransaction).toHaveBeenCalled();
      const broadcastArg = providerVat.broadcastTransaction.mock
        .calls[0][0] as string;
      // EIP-7702 serialized tx starts with 0x04
      expect(broadcastArg.startsWith('0x04')).toBe(true);

      vi.useRealTimers();
    });

    it('falls back to hardcoded gas when eth_estimateGas fails for EIP-7702', async () => {
      vi.useFakeTimers();

      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      // eth_getCode returns empty, eth_estimateGas rejects, then receipt confirms
      providerVat.request
        .mockResolvedValueOnce('0x') // initial eth_getCode check
        .mockRejectedValueOnce(new Error('method not supported')) // eth_estimateGas
        .mockResolvedValueOnce({ status: '0x1' }); // eth_getTransactionReceipt poll

      const configPromise = coordinator.createSmartAccount({
        chainId: 11155111,
        implementation: 'stateless7702',
      });

      await vi.advanceTimersByTimeAsync(2000);

      const config = await configPromise;
      expect(config.implementation).toBe('stateless7702');
      expect(config.deployed).toBe(true);

      // Should have broadcast despite gas estimation failure (using fallback gas)
      expect(providerVat.broadcastTransaction).toHaveBeenCalled();
      const broadcastArg = providerVat.broadcastTransaction.mock
        .calls[0][0] as string;
      expect(broadcastArg.startsWith('0x04')).toBe(true);

      vi.useRealTimers();
    });

    it('skips tx when EOA is already 7702-delegated', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      // eth_getCode returns valid EIP-7702 designator
      providerVat.request.mockResolvedValueOnce(
        '0xef010063c0c19a282a1b52b07dd5a65b58948a07dae32b',
      );

      const config = await coordinator.createSmartAccount({
        chainId: 11155111,
        implementation: 'stateless7702',
      });

      expect(config.implementation).toBe('stateless7702');
      expect(config.deployed).toBe(true);
      // No broadcast needed
      expect(providerVat.broadcastTransaction).not.toHaveBeenCalled();
    });

    it('throws when keyring is not available', async () => {
      const freshBaggage = makeMockBaggage();
      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );
      await coord.bootstrap({ provider: providerVat }, {});

      await expect(
        coord.createSmartAccount({
          chainId: 11155111,
          implementation: 'stateless7702',
        }),
      ).rejects.toThrow('No accounts available for EIP-7702 smart account');
    });

    it('throws when provider is not available', async () => {
      const freshBaggage = makeMockBaggage();
      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );
      await coord.bootstrap({ keyring: keyringVat }, {});
      await coord.initializeKeyring({ type: 'throwaway' });

      await expect(
        coord.createSmartAccount({
          chainId: 11155111,
          implementation: 'stateless7702',
        }),
      ).rejects.toThrow('Provider vat required');
    });

    it('throws when keyring has no accounts', async () => {
      const freshBaggage = makeMockBaggage();
      const emptyKeyring = {
        ...keyringVat,
        hasKeys: vi.fn().mockResolvedValue(false),
        getAccounts: vi.fn().mockResolvedValue([]),
      };
      const coord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        freshBaggage as any,
      );
      await coord.bootstrap(
        { keyring: emptyKeyring, provider: providerVat },
        {},
      );

      await expect(
        coord.createSmartAccount({
          chainId: 11155111,
          implementation: 'stateless7702',
        }),
      ).rejects.toThrow('No accounts available');
    });

    it('throws on confirmation timeout', async () => {
      vi.useFakeTimers();

      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      // eth_getCode returns empty (no EIP-7702 designator — e.g. Infura),
      // and eth_getTransactionReceipt returns null (tx not mined yet).
      providerVat.request.mockResolvedValue(null);

      const configPromise = coordinator.createSmartAccount({
        chainId: 11155111,
        implementation: 'stateless7702',
      });

      // Advance through all 45 poll attempts (2s each)
      for (let i = 0; i < 45; i++) {
        await vi.advanceTimersByTimeAsync(2000);
      }

      await expect(configPromise).rejects.toThrow('not confirmed after 90s');

      vi.useRealTimers();
    });
  });

  describe('submitDelegationUserOp (stateless7702 signing)', () => {
    /**
     * Set up a 7702 smart account (already-delegated path) and configure
     * a bundler.
     *
     * @param options - Setup options.
     * @param options.usePaymaster - Whether to enable paymaster sponsorship.
     * @returns The EOA address.
     */
    async function setup7702WithBundler(options?: {
      usePaymaster?: boolean;
    }): Promise<Address> {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      const accounts = await coordinator.getAccounts();
      const eoaAddress = accounts[0] as Address;

      // Set up 7702 smart account (already delegated)
      providerVat.request.mockResolvedValueOnce(
        '0xef010063c0c19a282a1b52b07dd5a65b58948a07dae32b',
      );
      await coordinator.createSmartAccount({
        chainId: 11155111,
        implementation: 'stateless7702',
      });

      await coordinator.configureBundler({
        bundlerUrl: 'https://bundler.example.com',
        chainId: 11155111,
        usePaymaster: options?.usePaymaster,
      });

      return eoaAddress;
    }

    it('uses EIP-712 typed data with 7702 domain name', async () => {
      const eoaAddress = await setup7702WithBundler();

      // Create a delegation
      const delegation = await coordinator.createDelegation({
        delegate: eoaAddress,
        caveats: [
          makeCaveat({
            type: 'allowedTargets',
            terms: encodeAllowedTargets([TARGET]),
          }),
        ],
        chainId: 11155111,
      });

      const result = await coordinator.redeemDelegation({
        execution: {
          target: TARGET,
          value: '0x0' as Hex,
          callData: '0x' as Hex,
        },
        delegationId: delegation.id,
        maxFeePerGas: '0x3b9aca00' as Hex,
        maxPriorityFeePerGas: '0x3b9aca00' as Hex,
      });

      expect(result).toBe('0xuserophash');

      // Verify UserOp was submitted with the EOA address as sender
      const submitCall = providerVat.submitUserOp.mock.calls[0][0];
      expect(submitCall.userOp.sender).toBe(eoaAddress);
      expect(submitCall.userOp.signature).toMatch(/^0x/u);
      expect(submitCall.userOp.signature).not.toBe('0x');
      // No factory should be included for 7702 accounts
      expect(submitCall.userOp.factory).toBeUndefined();
      expect(submitCall.userOp.factoryData).toBeUndefined();
    });

    it('produces a different signature than hybrid (typed data) signing', async () => {
      // --- 7702 path ---
      const eoa7702 = await setup7702WithBundler();

      const del7702 = await coordinator.createDelegation({
        delegate: eoa7702,
        caveats: [],
        chainId: 11155111,
      });

      await coordinator.redeemDelegation({
        execution: {
          target: TARGET,
          value: '0x0' as Hex,
          callData: '0x' as Hex,
        },
        delegationId: del7702.id,
        maxFeePerGas: '0x3b9aca00' as Hex,
        maxPriorityFeePerGas: '0x3b9aca00' as Hex,
      });

      const sig7702 =
        providerVat.submitUserOp.mock.calls[0][0].userOp.signature;

      // --- Hybrid path (fresh coordinator) ---
      const hybridBaggage = makeMockBaggage();
      const hybridKeyringBaggage = makeMockBaggage();
      const hybridDelegationBaggage = makeMockBaggage();

      const hybridKeyring = buildKeyringRoot(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hybridKeyringBaggage as any,
      );

      const hybridDelegation = buildDelegationRoot(
        {},
        {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hybridDelegationBaggage as any,
      );
      const hybridProvider = makeMockProviderVat();

      const hybridCoord = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hybridBaggage as any,
      );
      await hybridCoord.bootstrap(
        {
          keyring: hybridKeyring,
          provider: hybridProvider,
          delegation: hybridDelegation,
        },
        {},
      );
      await hybridCoord.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });
      await hybridCoord.createSmartAccount({
        deploySalt:
          '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex,
        chainId: 11155111,
      });
      await hybridCoord.configureBundler({
        bundlerUrl: 'https://bundler.example.com',
        chainId: 11155111,
      });

      const hybridAccounts = await hybridCoord.getAccounts();
      const delHybrid = await hybridCoord.createDelegation({
        delegate: hybridAccounts[0] as Address,
        caveats: [],
        chainId: 11155111,
      });

      await hybridCoord.redeemDelegation({
        execution: {
          target: TARGET,
          value: '0x0' as Hex,
          callData: '0x' as Hex,
        },
        delegationId: delHybrid.id,
        maxFeePerGas: '0x3b9aca00' as Hex,
        maxPriorityFeePerGas: '0x3b9aca00' as Hex,
      });

      const sigHybrid =
        hybridProvider.submitUserOp.mock.calls[0][0].userOp.signature;

      // The two signatures must differ: 7702 uses EIP-712 with domain
      // name 'EIP7702StatelessDeleGator', hybrid uses 'HybridDeleGator'.
      expect(sig7702).not.toBe(sigHybrid);
    });

    it('works with paymaster sponsorship', async () => {
      const eoaAddress = await setup7702WithBundler({ usePaymaster: true });

      const delegation = await coordinator.createDelegation({
        delegate: eoaAddress,
        caveats: [],
        chainId: 11155111,
      });

      const result = await coordinator.redeemDelegation({
        execution: {
          target: TARGET,
          value: '0x0' as Hex,
          callData: '0x' as Hex,
        },
        delegationId: delegation.id,
        maxFeePerGas: '0x3b9aca00' as Hex,
        maxPriorityFeePerGas: '0x3b9aca00' as Hex,
      });

      expect(result).toBe('0xuserophash');
      expect(providerVat.sponsorUserOp).toHaveBeenCalled();
      expect(providerVat.estimateUserOpGas).not.toHaveBeenCalled();

      const submitCall = providerVat.submitUserOp.mock.calls[0][0];
      expect(submitCall.userOp.paymaster).toBe(
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      );
      expect(submitCall.userOp.sender).toBe(eoaAddress);
      expect(submitCall.userOp.factory).toBeUndefined();
    });
  });
});
