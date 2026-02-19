import { describe, it, expect, beforeEach, vi } from 'vitest';

import { buildRootObject as buildDelegationRoot } from './delegation-vat.ts';
import { buildRootObject as buildKeyringRoot } from './keyring-vat.ts';
import { makeMockBaggage } from '../../test/helpers.ts';
import { encodeAllowedTargets, makeCaveat } from '../lib/caveats.ts';
import { ENTRY_POINT_V07 } from '../lib/userop.ts';
import type {
  Address,
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

vi.mock('../lib/sdk.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/sdk.ts')>();
  return {
    ...actual,
    computeSmartAccountAddress: vi.fn().mockResolvedValue({
      address: '0xcccccccccccccccccccccccccccccccccccccccc',
      factoryData: '0xfactorydata',
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
    request: vi.fn(),
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
      it('forwards to peer wallet when no local authority', async () => {
        const mockPeerWallet = {
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

        const signed = await coordinatorWithPeer.signTransaction(tx);
        expect(signed).toBe('0xpeersigned');
        expect(mockPeerWallet.handleSigningRequest).toHaveBeenCalledWith({
          type: 'transaction',
          tx,
        });
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
        hasPeerWallet: false,
        hasExternalSigner: false,
        hasBundlerConfig: false,
        smartAccountAddress: undefined,
      });
    });
  });

  describe('handleSigningRequest', () => {
    it('handles transaction signing requests', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      const accounts = await coordinator.getAccounts();
      const signed = await coordinator.handleSigningRequest({
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
      });

      expect(signed).toMatch(/^0x/u);
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

    it('rejects invalid signer objects', async () => {
      await expect(coordinator.connectExternalSigner(null)).rejects.toThrow(
        'Invalid external signer',
      );

      await expect(
        coordinator.connectExternalSigner({ getAccounts: vi.fn() }),
      ).rejects.toThrow('Invalid external signer');

      await expect(
        coordinator.connectExternalSigner({
          getAccounts: vi.fn(),
          signTypedData: vi.fn(),
          // missing signMessage and signTransaction
        }),
      ).rejects.toThrow('Invalid external signer');
    });

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
    it('falls back to external signer for transaction requests', async () => {
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

      const signed = await coord.handleSigningRequest({
        type: 'transaction',
        tx,
      });
      expect(signed).toBe(
        '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef00',
      );
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
          type: 'transaction',
          tx: {
            from: EXT_SIGNER_ACCOUNT,
            to: TARGET,
            chainId: 1,
            nonce: 0,
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
      expect(extSigner.signMessage).toHaveBeenCalled();
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
  });
});
