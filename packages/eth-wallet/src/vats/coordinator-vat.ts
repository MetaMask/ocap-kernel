import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type { Baggage } from '@metamask/ocap-kernel';

import type {
  Action,
  Address,
  ChainConfig,
  CreateDelegationOptions,
  Delegation,
  Eip712TypedData,
  Hex,
  TransactionRequest,
  WalletCapabilities,
} from '../types.ts';

/**
 * Vat powers for the coordinator vat.
 */
type VatPowers = Record<string, unknown>;

/**
 * Vat references available in the wallet subcluster.
 */
type WalletVats = {
  keyring?: unknown;
  provider?: unknown;
  delegation?: unknown;
};

/**
 * Services available to the wallet subcluster.
 */
type WalletServices = {
  ocapURLIssuerService?: unknown;
  ocapURLRedemptionService?: unknown;
};

// Typed facets for E() calls (avoid `any` by using explicit method signatures)
type KeyringFacet = {
  initialize: (options: { type: string; mnemonic?: string }) => Promise<void>;
  hasKeys: () => Promise<boolean>;
  getAccounts: () => Promise<Address[]>;
  deriveAccount: (index: number) => Promise<Address>;
  signTransaction: (tx: TransactionRequest) => Promise<Hex>;
  signTypedData: (data: Eip712TypedData) => Promise<Hex>;
  signMessage: (message: string, from?: Address) => Promise<Hex>;
};

type ProviderFacet = {
  configure: (config: ChainConfig) => Promise<void>;
  request: (method: string, params?: unknown[]) => Promise<unknown>;
  broadcastTransaction: (signedTx: Hex) => Promise<Hex>;
};

type DelegationFacet = {
  createDelegation: (
    options: CreateDelegationOptions & { delegator: Address },
  ) => Promise<Delegation>;
  prepareDelegationForSigning: (id: string) => Promise<Eip712TypedData>;
  storeSigned: (id: string, signature: Hex) => Promise<void>;
  receiveDelegation: (delegation: Delegation) => Promise<void>;
  findDelegationForAction: (action: Action) => Promise<Delegation | undefined>;
  getDelegation: (id: string) => Promise<Delegation>;
  listDelegations: () => Promise<Delegation[]>;
  revokeDelegation: (id: string) => Promise<void>;
};

type PeerWalletFacet = {
  handleSigningRequest: (request: {
    type: string;
    tx?: TransactionRequest;
    data?: Eip712TypedData;
    message?: string;
    account?: Address;
  }) => Promise<Hex>;
};

type OcapURLIssuerFacet = {
  issue: (target: unknown) => Promise<string>;
};

type OcapURLRedemptionFacet = {
  redeem: (url: string) => Promise<unknown>;
};

/**
 * Build the root object for the coordinator vat (bootstrap vat).
 *
 * The coordinator orchestrates signing strategy resolution, delegation
 * management, and peer wallet communication. It is the public API of
 * the wallet subcluster.
 *
 * @param _vatPowers - Special powers granted to this vat.
 * @param _parameters - Initialization parameters.
 * @param baggage - Root of vat's persistent state.
 * @returns The root object for the coordinator vat.
 */
export function buildRootObject(
  _vatPowers: VatPowers,
  _parameters: unknown,
  baggage: Baggage,
): object {
  // References to other vats (set during bootstrap)
  let keyringVat: KeyringFacet | undefined;
  let providerVat: ProviderFacet | undefined;
  let delegationVat: DelegationFacet | undefined;
  let issuerService: OcapURLIssuerFacet | undefined;
  let redemptionService: OcapURLRedemptionFacet | undefined;

  // Peer wallet reference (Phase 2: set via connectToPeer)
  let peerWallet: PeerWalletFacet | undefined;

  // Restore vat references from baggage if available (resuscitation)
  if (baggage.has('keyringVat')) {
    keyringVat = baggage.get('keyringVat') as KeyringFacet;
  }
  if (baggage.has('providerVat')) {
    providerVat = baggage.get('providerVat') as ProviderFacet;
  }
  if (baggage.has('delegationVat')) {
    delegationVat = baggage.get('delegationVat') as DelegationFacet;
  }
  if (baggage.has('peerWallet')) {
    peerWallet = baggage.get('peerWallet') as PeerWalletFacet;
  }

  /**
   * Persist a baggage key-value pair, handling both init and update.
   *
   * @param key - The baggage key.
   * @param value - The value to persist.
   */
  function persistBaggage(key: string, value: unknown): void {
    if (baggage.has(key)) {
      baggage.set(key, value);
    } else {
      baggage.init(key, value);
    }
  }

  /**
   * Resolve the signing strategy for a transaction.
   * Priority: delegation → local key → peer wallet → reject
   *
   * @param tx - The transaction request to sign.
   * @returns The signed transaction as a hex string.
   */
  async function resolveTransactionSigning(
    tx: TransactionRequest,
  ): Promise<Hex> {
    // Strategy 1: Check if a delegation covers this action
    if (delegationVat) {
      const delegation = await E(delegationVat).findDelegationForAction({
        to: tx.to,
        value: tx.value,
        data: tx.data,
      });

      if (delegation) {
        // For MVP, we sign the original transaction with the local key
        // In a full implementation, this would prepare a UserOp and redeem the delegation
        if (keyringVat) {
          const accounts = await E(keyringVat).getAccounts();
          if (accounts.length > 0) {
            return E(keyringVat).signTransaction(tx);
          }
        }
      }
    }

    // Strategy 2: Check if local keyring owns this account
    if (keyringVat) {
      const accounts = await E(keyringVat).getAccounts();
      if (accounts.includes(tx.from.toLowerCase() as Address)) {
        return E(keyringVat).signTransaction(tx);
      }
    }

    // Strategy 3: Check if a peer wallet can handle it (Phase 2)
    if (peerWallet) {
      return E(peerWallet).handleSigningRequest({
        type: 'transaction',
        tx,
      });
    }

    throw new Error('No authority to sign this transaction');
  }

  const coordinator = makeDefaultExo('walletCoordinator', {
    // ------------------------------------------------------------------
    // Lifecycle
    // ------------------------------------------------------------------

    async bootstrap(vats: WalletVats, services: WalletServices): Promise<void> {
      keyringVat = vats.keyring as KeyringFacet | undefined;
      providerVat = vats.provider as ProviderFacet | undefined;
      delegationVat = vats.delegation as DelegationFacet | undefined;
      issuerService = services.ocapURLIssuerService as
        | OcapURLIssuerFacet
        | undefined;
      redemptionService = services.ocapURLRedemptionService as
        | OcapURLRedemptionFacet
        | undefined;

      if (keyringVat) {
        persistBaggage('keyringVat', keyringVat);
      }
      if (providerVat) {
        persistBaggage('providerVat', providerVat);
      }
      if (delegationVat) {
        persistBaggage('delegationVat', delegationVat);
      }
    },

    // ------------------------------------------------------------------
    // Wallet initialization
    // ------------------------------------------------------------------

    async initializeKeyring(options: {
      type: 'srp' | 'throwaway';
      mnemonic?: string;
    }): Promise<void> {
      if (!keyringVat) {
        throw new Error('Keyring vat not available');
      }
      const initOptions =
        options.type === 'srp'
          ? { type: 'srp' as const, mnemonic: options.mnemonic ?? '' }
          : { type: 'throwaway' as const };
      await E(keyringVat).initialize(initOptions);
    },

    async configureProvider(chainConfig: ChainConfig): Promise<void> {
      if (!providerVat) {
        throw new Error('Provider vat not available');
      }
      await E(providerVat).configure(chainConfig);
    },

    // ------------------------------------------------------------------
    // Public wallet API
    // ------------------------------------------------------------------

    async getAccounts(): Promise<Address[]> {
      const localAccounts: Address[] = keyringVat
        ? await E(keyringVat).getAccounts()
        : [];

      // In future: merge with delegation-covered accounts
      return localAccounts;
    },

    async signTransaction(tx: TransactionRequest): Promise<Hex> {
      return resolveTransactionSigning(tx);
    },

    async sendTransaction(tx: TransactionRequest): Promise<Hex> {
      if (!providerVat) {
        throw new Error('Provider not configured');
      }
      const signedTx = await resolveTransactionSigning(tx);
      return E(providerVat).broadcastTransaction(signedTx);
    },

    async signTypedData(data: Eip712TypedData): Promise<Hex> {
      if (keyringVat) {
        const hasKeys = await E(keyringVat).hasKeys();
        if (hasKeys) {
          return E(keyringVat).signTypedData(data);
        }
      }

      if (peerWallet) {
        return E(peerWallet).handleSigningRequest({
          type: 'typedData',
          data,
        });
      }

      throw new Error('No authority to sign typed data');
    },

    async signMessage(message: string, account?: Address): Promise<Hex> {
      if (keyringVat) {
        const hasKeys = await E(keyringVat).hasKeys();
        if (hasKeys) {
          return E(keyringVat).signMessage(message, account);
        }
      }

      if (peerWallet) {
        return E(peerWallet).handleSigningRequest({
          type: 'message',
          message,
          ...(account ? { account } : {}),
        });
      }

      throw new Error('No authority to sign message');
    },

    async request(method: string, params?: unknown[]): Promise<unknown> {
      if (!providerVat) {
        throw new Error('Provider not configured');
      }
      return E(providerVat).request(method, params);
    },

    // ------------------------------------------------------------------
    // Delegation management
    // ------------------------------------------------------------------

    async createDelegation(opts: CreateDelegationOptions): Promise<Delegation> {
      if (!delegationVat || !keyringVat) {
        throw new Error('Delegation or keyring vat not available');
      }

      const accounts = await E(keyringVat).getAccounts();
      if (accounts.length === 0) {
        throw new Error('No accounts available to create delegation');
      }
      const delegator = accounts[0] as Address;

      const delegation = await E(delegationVat).createDelegation({
        ...opts,
        delegator,
      });

      const typedData = await E(delegationVat).prepareDelegationForSigning(
        delegation.id,
      );

      const signature = await E(keyringVat).signTypedData(typedData);

      await E(delegationVat).storeSigned(delegation.id, signature);

      return E(delegationVat).getDelegation(delegation.id);
    },

    async receiveDelegation(delegation: Delegation): Promise<void> {
      if (!delegationVat) {
        throw new Error('Delegation vat not available');
      }
      await E(delegationVat).receiveDelegation(delegation);
    },

    async revokeDelegation(id: string): Promise<void> {
      if (!delegationVat) {
        throw new Error('Delegation vat not available');
      }
      await E(delegationVat).revokeDelegation(id);
    },

    async listDelegations(): Promise<Delegation[]> {
      if (!delegationVat) {
        return [];
      }
      return E(delegationVat).listDelegations();
    },

    // ------------------------------------------------------------------
    // Peer wallet connectivity (Phase 2 stubs)
    // ------------------------------------------------------------------

    async issueOcapUrl(): Promise<string> {
      if (!issuerService) {
        throw new Error('OCAP URL issuer service not available');
      }
      return E(issuerService).issue(coordinator);
    },

    async connectToPeer(ocapUrl: string): Promise<void> {
      if (!redemptionService) {
        throw new Error('OCAP URL redemption service not available');
      }
      peerWallet = (await E(redemptionService).redeem(
        ocapUrl,
      )) as PeerWalletFacet;
      persistBaggage('peerWallet', peerWallet);
    },

    async handleSigningRequest(request: {
      type: string;
      tx?: TransactionRequest;
      data?: Eip712TypedData;
      message?: string;
      account?: Address;
    }): Promise<Hex> {
      switch (request.type) {
        case 'transaction':
          if (!request.tx) {
            throw new Error('Missing transaction in signing request');
          }
          if (!keyringVat) {
            throw new Error('No local keyring to handle signing request');
          }
          return E(keyringVat).signTransaction(request.tx);

        case 'typedData':
          if (!request.data) {
            throw new Error('Missing typed data in signing request');
          }
          if (!keyringVat) {
            throw new Error('No local keyring to handle signing request');
          }
          return E(keyringVat).signTypedData(request.data);

        case 'message':
          if (!request.message) {
            throw new Error('Missing message in signing request');
          }
          if (!keyringVat) {
            throw new Error('No local keyring to handle signing request');
          }
          return E(keyringVat).signMessage(request.message, request.account);

        default:
          throw new Error(`Unknown signing request type: ${request.type}`);
      }
    },

    // ------------------------------------------------------------------
    // Introspection
    // ------------------------------------------------------------------

    async getCapabilities(): Promise<WalletCapabilities> {
      const hasLocalKeys = keyringVat ? await E(keyringVat).hasKeys() : false;

      const localAccounts: Address[] = keyringVat
        ? await E(keyringVat).getAccounts()
        : [];

      const delegations: Delegation[] = delegationVat
        ? await E(delegationVat).listDelegations()
        : [];

      return {
        hasLocalKeys,
        localAccounts,
        delegationCount: delegations.length,
        hasPeerWallet: peerWallet !== undefined,
      };
    },
  });
  return coordinator;
}
