import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type { Baggage } from '@metamask/ocap-kernel';

import {
  buildSdkRedeemCallData,
  computeSmartAccountAddress,
  isEip7702Delegated,
  prepareUserOpTypedData,
  resolveEnvironment,
} from '../lib/sdk.ts';
import {
  buildDelegationUserOp,
  computeUserOpHash,
  ENTRY_POINT_V07,
} from '../lib/userop.ts';
import type {
  Action,
  Address,
  ChainConfig,
  CreateDelegationOptions,
  Delegation,
  Eip712TypedData,
  Execution,
  Hex,
  SmartAccountConfig,
  TransactionRequest,
  UserOperation,
  WalletCapabilities,
} from '../types.ts';

const harden = globalThis.harden ?? (<T>(value: T): T => value);

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
  signHash: (hash: Hex, from?: Address) => Promise<Hex>;
  signAuthorization: (
    contractAddress: Address,
    chainId: number,
    from?: Address,
  ) => Promise<unknown>;
};

type ProviderFacet = {
  configure: (config: ChainConfig) => Promise<void>;
  request: (method: string, params?: unknown[]) => Promise<unknown>;
  broadcastTransaction: (signedTx: Hex) => Promise<Hex>;
  getChainId: () => Promise<number>;
  getNonce: (address: Address) => Promise<number>;
  getEntryPointNonce: (options: {
    entryPoint: Address;
    sender: Address;
    key?: Hex;
  }) => Promise<Hex>;
  submitUserOp: (options: {
    bundlerUrl: string;
    entryPoint: Hex;
    userOp: UserOperation;
  }) => Promise<Hex>;
  estimateUserOpGas: (options: {
    bundlerUrl: string;
    entryPoint: Hex;
    userOp: UserOperation;
  }) => Promise<{
    callGasLimit: Hex;
    verificationGasLimit: Hex;
    preVerificationGas: Hex;
  }>;
  getUserOpReceipt: (options: {
    bundlerUrl: string;
    userOpHash: Hex;
  }) => Promise<unknown>;
  getGasFees: () => Promise<{
    maxFeePerGas: Hex;
    maxPriorityFeePerGas: Hex;
  }>;
  configureBundler: (config: {
    bundlerUrl: string;
    chainId: number;
  }) => Promise<void>;
  sponsorUserOp: (options: {
    bundlerUrl: string;
    entryPoint: Hex;
    userOp: UserOperation;
    context?: Record<string, unknown>;
  }) => Promise<{
    paymaster: Address;
    paymasterData: Hex;
    paymasterVerificationGasLimit: Hex;
    paymasterPostOpGasLimit: Hex;
    callGasLimit: Hex;
    verificationGasLimit: Hex;
    preVerificationGas: Hex;
  }>;
};

type DelegationFacet = {
  createDelegation: (
    options: CreateDelegationOptions & { delegator: Address },
  ) => Promise<Delegation>;
  prepareDelegationForSigning: (id: string) => Promise<Eip712TypedData>;
  storeSigned: (id: string, signature: Hex) => Promise<void>;
  receiveDelegation: (delegation: Delegation) => Promise<void>;
  findDelegationForAction: (
    action: Action,
    chainId?: number,
    currentTime?: number,
  ) => Promise<Delegation | undefined>;
  getDelegation: (id: string) => Promise<Delegation>;
  listDelegations: () => Promise<Delegation[]>;
  revokeDelegation: (id: string) => Promise<void>;
};

type PeerWalletFacet = {
  getAccounts: () => Promise<Address[]>;
  handleSigningRequest: (request: {
    type: string;
    tx?: TransactionRequest;
    data?: Eip712TypedData;
    message?: string;
    account?: Address;
  }) => Promise<Hex>;
};

type ExternalSignerFacet = {
  getAccounts: () => Promise<Address[]>;
  signTypedData: (data: Eip712TypedData, from: Address) => Promise<Hex>;
  signMessage: (message: string, from: Address) => Promise<Hex>;
  signTransaction: (tx: TransactionRequest) => Promise<Hex>;
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

  // Peer wallet reference (set via connectToPeer)
  let peerWallet: PeerWalletFacet | undefined;

  // External signer reference (e.g. MetaMask).
  // Note: external signers are transient — they must be reconnected after
  // kernel restart via connectExternalSigner(). The baggage entry tracks
  // the reference but it may be stale after resuscitation.
  let externalSigner: ExternalSignerFacet | undefined;

  // Bundler configuration for ERC-4337 UserOps
  let bundlerConfig:
    | {
        bundlerUrl: string;
        entryPoint: Hex;
        chainId: number;
        usePaymaster?: boolean;
        sponsorshipPolicyId?: string;
      }
    | undefined;

  // Smart account configuration (persisted in baggage)
  let smartAccountConfig: SmartAccountConfig | undefined;

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
  if (baggage.has('externalSigner')) {
    externalSigner = baggage.get('externalSigner') as ExternalSignerFacet;
  }
  if (baggage.has('bundlerConfig')) {
    bundlerConfig = baggage.get('bundlerConfig') as typeof bundlerConfig;
  }
  if (baggage.has('smartAccountConfig')) {
    smartAccountConfig = baggage.get(
      'smartAccountConfig',
    ) as SmartAccountConfig;
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
   * Resolve the signing strategy for typed data.
   * Priority: keyring → external signer → peer wallet → error
   *
   * @param data - The EIP-712 typed data to sign.
   * @param from - Optional sender address.
   * @returns The signature as a hex string.
   */
  async function resolveTypedDataSigning(
    data: Eip712TypedData,
    from?: Address,
  ): Promise<Hex> {
    if (keyringVat) {
      const hasKeys = await E(keyringVat).hasKeys();
      if (hasKeys) {
        return E(keyringVat).signTypedData(data);
      }
    }

    if (externalSigner) {
      const accounts = await E(externalSigner).getAccounts();
      if (accounts.length > 0) {
        return E(externalSigner).signTypedData(data, from ?? accounts[0]);
      }
    }

    if (peerWallet) {
      return E(peerWallet).handleSigningRequest({
        type: 'typedData',
        data,
      });
    }

    throw new Error('No authority to sign typed data');
  }

  /**
   * Resolve the signing strategy for a personal message.
   * Priority: keyring → external signer → peer wallet → error
   *
   * @param message - The message to sign.
   * @param from - Optional sender address.
   * @returns The signature as a hex string.
   */
  async function resolveMessageSigning(
    message: string,
    from?: Address,
  ): Promise<Hex> {
    if (keyringVat) {
      const hasKeys = await E(keyringVat).hasKeys();
      if (hasKeys) {
        return E(keyringVat).signMessage(message, from);
      }
    }

    if (externalSigner) {
      const accounts = await E(externalSigner).getAccounts();
      if (accounts.length > 0) {
        return E(externalSigner).signMessage(message, from ?? accounts[0]);
      }
    }

    if (peerWallet) {
      return E(peerWallet).handleSigningRequest({
        type: 'message',
        message,
        ...(from ? { account: from } : {}),
      });
    }

    throw new Error('No authority to sign message');
  }

  /**
   * Resolve the signing strategy for a raw hash (ECDSA without EIP-191 prefix).
   * Used for signing UserOp hashes where the EntryPoint expects raw ECDSA.
   * Priority: keyring → external signer (signMessage) → error
   *
   * Note: peer wallet is intentionally excluded — its signMessage uses EIP-191
   * which adds a prefix, producing an invalid signature for raw hash signing.
   *
   * @param hash - The hash to sign.
   * @param from - Optional sender address.
   * @returns The signature as a hex string.
   */
  async function resolveHashSigning(hash: Hex, from?: Address): Promise<Hex> {
    // Local keyring: raw ECDSA (no EIP-191 prefix)
    if (keyringVat) {
      const hasKeys = await E(keyringVat).hasKeys();
      if (hasKeys) {
        return E(keyringVat).signHash(hash, from);
      }
    }

    // Raw ECDSA hash signing requires a local keyring. External signers and
    // peer wallets use EIP-191 (signMessage), which prefixes the hash and
    // produces invalid signatures for UserOp hashes.
    const reasons: string[] = [];
    if (keyringVat) {
      reasons.push('keyring has no keys');
    }
    if (externalSigner) {
      reasons.push('external signer uses EIP-191 (incompatible)');
    }
    if (peerWallet) {
      reasons.push('peer wallet uses EIP-191 (incompatible)');
    }
    throw new Error(
      `No authority to sign hash: raw hash signing requires a local keyring with keys${
        reasons.length > 0 ? ` (${reasons.join('; ')})` : ''
      }`,
    );
  }

  /**
   * Resolve the signing strategy for a transaction.
   * Priority: local key → external signer → reject
   *
   * @param tx - The transaction request to sign.
   * @returns The signed transaction as a hex string.
   */
  async function resolveTransactionSigning(
    tx: TransactionRequest,
  ): Promise<Hex> {
    // Strategy 1: Check if local keyring owns this account
    if (keyringVat) {
      const accounts = await E(keyringVat).getAccounts();
      if (accounts.includes(tx.from.toLowerCase() as Address)) {
        return E(keyringVat).signTransaction(tx);
      }
    }

    // Strategy 2: Check if external signer can handle it
    if (externalSigner) {
      return E(externalSigner).signTransaction({
        ...tx,
        from: tx.from.toLowerCase() as Address,
      });
    }

    throw new Error('No authority to sign this transaction');
  }

  /**
   * Build, sign, and submit a UserOp that redeems one or more delegations.
   *
   * @param options - UserOp pipeline options.
   * @param options.delegations - The delegation chain (leaf to root).
   * @param options.execution - The execution to perform.
   * @param options.maxFeePerGas - Max fee per gas.
   * @param options.maxPriorityFeePerGas - Max priority fee per gas.
   * @returns The UserOp hash from the bundler.
   */
  async function submitDelegationUserOp(options: {
    delegations: Delegation[];
    execution: Execution;
    maxFeePerGas?: Hex;
    maxPriorityFeePerGas?: Hex;
  }): Promise<Hex> {
    if (!providerVat) {
      throw new Error('Provider vat not available');
    }
    if (!bundlerConfig) {
      throw new Error('Bundler not configured');
    }

    // Estimate gas fees if not explicitly provided
    let { maxFeePerGas, maxPriorityFeePerGas } = options;
    if (!maxFeePerGas || !maxPriorityFeePerGas) {
      const fees = await E(providerVat).getGasFees();
      // Add 10% buffer to gas fees to meet bundler minimums
      const bumpHex = (value: Hex): Hex => {
        const bumped = (BigInt(value) * 110n) / 100n;
        return `0x${bumped.toString(16)}`;
      };
      maxFeePerGas = maxFeePerGas ?? bumpHex(fees.maxFeePerGas);
      maxPriorityFeePerGas =
        maxPriorityFeePerGas ?? bumpHex(fees.maxPriorityFeePerGas);
    }

    // Use smart account address as sender when configured, otherwise delegate
    const sender =
      smartAccountConfig?.address ?? options.delegations[0].delegate;

    // Get nonce from EntryPoint contract (ERC-4337 nonce)
    const nonceHex = await E(providerVat).getEntryPointNonce({
      entryPoint: bundlerConfig.entryPoint,
      sender,
    });

    // Stateless7702 accounts never need factory data
    const isStateless7702 =
      smartAccountConfig?.implementation === 'stateless7702';

    // Check on-chain whether the smart account is deployed (eth_getCode).
    // This avoids relying on a cached flag that could be stale if the
    // deployment UserOp failed on-chain.
    let includeFactory = false;
    if (
      !isStateless7702 &&
      smartAccountConfig?.factory &&
      smartAccountConfig.factoryData
    ) {
      const code = (await E(providerVat).request('eth_getCode', [
        sender,
        'latest',
      ])) as string;
      includeFactory = code === '0x' || code === '0x0';

      if (!includeFactory && smartAccountConfig.deployed === false) {
        smartAccountConfig = harden({
          ...smartAccountConfig,
          deployed: true,
        });
        persistBaggage('smartAccountConfig', smartAccountConfig);
      }
    }

    // Build the callData using the SDK's encoder, which wraps
    // redeemDelegations inside a DeleGatorCore.execute call so the
    // smart account routes the call to the DelegationManager.
    const sdkCallData = buildSdkRedeemCallData({
      delegations: options.delegations,
      execution: options.execution,
      chainId: bundlerConfig.chainId,
    });

    // Build unsigned UserOp with the SDK-encoded callData.
    // Include a dummy 65-byte signature so that the smart account's
    // validateUserOp can parse the ECDSA signature during bundler/paymaster
    // simulation. An empty signature (0x) causes the simulation to revert.
    const baseUserOp = buildDelegationUserOp({
      sender,
      nonce: nonceHex,
      delegations: options.delegations,
      execution: options.execution,
      maxFeePerGas,
      maxPriorityFeePerGas,
      ...(includeFactory && smartAccountConfig
        ? {
            factory: smartAccountConfig.factory as Hex,
            factoryData: smartAccountConfig.factoryData as Hex,
          }
        : {}),
    });
    // Use SDK-encoded callData and a dummy 65-byte signature for simulation
    const unsignedUserOp: UserOperation = {
      ...baseUserOp,
      callData: sdkCallData,
      signature:
        '0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c' as Hex,
    };

    let userOpWithGas: UserOperation;

    if (bundlerConfig.usePaymaster) {
      // Use paymaster sponsorship instead of gas estimation
      const sponsorContext: Record<string, unknown> = {};
      if (bundlerConfig.sponsorshipPolicyId) {
        sponsorContext.sponsorshipPolicyId = bundlerConfig.sponsorshipPolicyId;
      }

      const sponsorResult = await E(providerVat).sponsorUserOp({
        bundlerUrl: bundlerConfig.bundlerUrl,
        entryPoint: bundlerConfig.entryPoint,
        userOp: unsignedUserOp,
        context: sponsorContext,
      });

      userOpWithGas = {
        ...unsignedUserOp,
        paymaster: sponsorResult.paymaster,
        paymasterData: sponsorResult.paymasterData,
        paymasterVerificationGasLimit:
          sponsorResult.paymasterVerificationGasLimit,
        paymasterPostOpGasLimit: sponsorResult.paymasterPostOpGasLimit,
        callGasLimit: sponsorResult.callGasLimit,
        verificationGasLimit: sponsorResult.verificationGasLimit,
        preVerificationGas: sponsorResult.preVerificationGas,
      };
    } else {
      // Estimate gas via bundler
      const gasEstimate = await E(providerVat).estimateUserOpGas({
        bundlerUrl: bundlerConfig.bundlerUrl,
        entryPoint: bundlerConfig.entryPoint,
        userOp: unsignedUserOp,
      });

      userOpWithGas = {
        ...unsignedUserOp,
        callGasLimit: gasEstimate.callGasLimit,
        verificationGasLimit: gasEstimate.verificationGasLimit,
        preVerificationGas: gasEstimate.preVerificationGas,
      };
    }

    // Sign the UserOp.
    // Stateless7702: raw ECDSA over the standard UserOp hash.
    // Hybrid: EIP-712 typed data with smart account as verifyingContract.
    let signature: Hex;
    if (isStateless7702) {
      const hash = computeUserOpHash(
        userOpWithGas,
        bundlerConfig.entryPoint,
        bundlerConfig.chainId,
      );
      signature = await resolveHashSigning(hash);
    } else {
      const userOpTypedData = prepareUserOpTypedData({
        userOp: userOpWithGas,
        entryPoint: bundlerConfig.entryPoint,
        chainId: bundlerConfig.chainId,
        smartAccountAddress: sender,
      });
      signature = await resolveTypedDataSigning(userOpTypedData);
    }

    // Attach signature and submit
    const signedUserOp: UserOperation = {
      ...userOpWithGas,
      signature,
    };

    const result = await E(providerVat).submitUserOp({
      bundlerUrl: bundlerConfig.bundlerUrl,
      entryPoint: bundlerConfig.entryPoint,
      userOp: signedUserOp,
    });

    return result;
  }

  /**
   * Create a Stateless7702 smart account by signing and broadcasting
   * an EIP-7702 authorization transaction. The user's EOA address
   * becomes the smart account — no factory deployment or funding needed.
   *
   * @param chainId - The chain ID.
   * @returns The smart account configuration.
   */
  async function createStateless7702SmartAccount(
    chainId: number,
  ): Promise<SmartAccountConfig> {
    if (!keyringVat) {
      throw new Error('Keyring vat required for EIP-7702 authorization');
    }
    if (!providerVat) {
      throw new Error('Provider vat required for EIP-7702 authorization');
    }

    const accounts = await E(keyringVat).getAccounts();
    if (accounts.length === 0) {
      throw new Error('No accounts available');
    }
    const eoaAddress = accounts[0];

    // Check if already set up (persisted from a prior call)
    if (
      smartAccountConfig?.implementation === 'stateless7702' &&
      smartAccountConfig.address === eoaAddress
    ) {
      return smartAccountConfig;
    }

    // Best-effort on-chain check — works on providers that support
    // EIP-7702 designator codes via eth_getCode (not all do, e.g. Infura).
    const code = (await E(providerVat).request('eth_getCode', [
      eoaAddress,
      'latest',
    ])) as string;

    if (isEip7702Delegated(code, chainId)) {
      // eslint-disable-next-line require-atomic-updates
      smartAccountConfig = harden({
        implementation: 'stateless7702' as const,
        address: eoaAddress,
        deployed: true,
      });
      persistBaggage('smartAccountConfig', smartAccountConfig);
      return smartAccountConfig;
    }

    // Sign EIP-7702 authorization
    const env = resolveEnvironment(chainId);
    const implAddress = (
      env.implementations as Record<string, string | undefined>
    ).EIP7702StatelessDeleGatorImpl;
    if (!implAddress) {
      throw new Error(
        `EIP7702StatelessDeleGatorImpl not found in environment for chain ${String(chainId)}`,
      );
    }

    const signedAuth = await E(keyringVat).signAuthorization(
      implAddress as Address,
      chainId,
    );

    // Build and sign the EIP-7702 transaction.
    // Use a conservative fixed gas limit: an EIP-7702 authorization-only tx
    // (no calldata, no value) costs ~65k gas. Standard eth_estimateGas may
    // not support the authorizationList parameter on all RPC providers.
    const EIP7702_AUTH_GAS_LIMIT = '0x19000' as Hex; // 102400
    const nonce = await E(providerVat).getNonce(eoaAddress);
    const fees = await E(providerVat).getGasFees();

    const signedTx = await E(keyringVat).signTransaction({
      from: eoaAddress,
      to: eoaAddress,
      chainId,
      nonce,
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      gasLimit: EIP7702_AUTH_GAS_LIMIT,
      authorizationList: [signedAuth],
    });

    const txHash = await E(providerVat).broadcastTransaction(signedTx);

    // Wait for the authorization tx to be mined. Some RPC providers (e.g.
    // Infura) don't expose EIP-7702 designator code via eth_getCode, so we
    // poll eth_getTransactionReceipt instead (status 0x1 = success).
    if (typeof globalThis.setTimeout !== 'function') {
      throw new Error(
        'EIP-7702 confirmation polling requires setTimeout ' +
          '(not available in SES compartments without timer endowments)',
      );
    }
    const maxAttempts = 45;
    for (let i = 0; i < maxAttempts; i++) {
      const receipt = (await E(providerVat).request(
        'eth_getTransactionReceipt',
        [txHash],
      )) as { status?: string } | null;
      if (receipt?.status === '0x1') {
        break;
      }
      if (i === maxAttempts - 1) {
        throw new Error(
          `EIP-7702 authorization tx ${txHash} not confirmed after 90s`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // eslint-disable-next-line require-atomic-updates
    smartAccountConfig = harden({
      implementation: 'stateless7702' as const,
      address: eoaAddress,
      deployed: true,
    });
    persistBaggage('smartAccountConfig', smartAccountConfig);
    return smartAccountConfig;
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
      entropy?: Hex;
    }): Promise<void> {
      if (!keyringVat) {
        throw new Error('Keyring vat not available');
      }
      const initOptions =
        options.type === 'srp'
          ? { type: 'srp' as const, mnemonic: options.mnemonic ?? '' }
          : { type: 'throwaway' as const, entropy: options.entropy };
      await E(keyringVat).initialize(initOptions);
    },

    async configureProvider(chainConfig: ChainConfig): Promise<void> {
      if (!providerVat) {
        throw new Error('Provider vat not available');
      }

      // Validate RPC URL (regex — URL constructor unavailable under SES)
      if (!/^https?:\/\/.+/u.test(chainConfig.rpcUrl)) {
        throw new Error(
          `Invalid RPC URL: "${chainConfig.rpcUrl}". Must be a valid HTTP(S) URL.`,
        );
      }

      if (!Number.isInteger(chainConfig.chainId) || chainConfig.chainId <= 0) {
        throw new Error(
          `Invalid chain ID: ${String(chainConfig.chainId)}. Must be a positive integer.`,
        );
      }

      await E(providerVat).configure(chainConfig);
    },

    // ------------------------------------------------------------------
    // External signer & bundler configuration
    // ------------------------------------------------------------------

    async connectExternalSigner(signer: ExternalSignerFacet): Promise<void> {
      if (!signer || typeof signer !== 'object') {
        throw new Error('Invalid external signer: must be a non-null object');
      }
      externalSigner = signer;
      persistBaggage('externalSigner', externalSigner);
    },

    async configureBundler(config: {
      bundlerUrl: string;
      entryPoint?: Hex;
      chainId: number;
      usePaymaster?: boolean;
      sponsorshipPolicyId?: string;
    }): Promise<void> {
      // Validate bundler URL (regex — URL constructor unavailable under SES)
      if (!/^https?:\/\/.+/u.test(config.bundlerUrl)) {
        throw new Error(
          `Invalid bundler URL: "${config.bundlerUrl}". Must be a valid HTTP(S) URL.`,
        );
      }

      if (!Number.isInteger(config.chainId) || config.chainId <= 0) {
        throw new Error(
          `Invalid chain ID: ${String(config.chainId)}. Must be a positive integer.`,
        );
      }

      bundlerConfig = harden({
        bundlerUrl: config.bundlerUrl,
        entryPoint: config.entryPoint ?? ENTRY_POINT_V07,
        chainId: config.chainId,
        usePaymaster: config.usePaymaster,
        sponsorshipPolicyId: config.sponsorshipPolicyId,
      });
      persistBaggage('bundlerConfig', bundlerConfig);

      if (!providerVat) {
        throw new Error(
          'Provider vat not available. Call configureProvider() before configureBundler().',
        );
      }
      await E(providerVat).configureBundler({
        bundlerUrl: config.bundlerUrl,
        chainId: config.chainId,
      });
    },

    // ------------------------------------------------------------------
    // Smart account configuration
    // ------------------------------------------------------------------

    async createSmartAccount(config: {
      deploySalt?: Hex;
      chainId: number;
      address?: Address;
      implementation?: 'hybrid' | 'stateless7702';
    }): Promise<SmartAccountConfig> {
      const implementation = config.implementation ?? 'hybrid';

      if (implementation === 'stateless7702') {
        return createStateless7702SmartAccount(config.chainId);
      }

      // Hybrid path (existing logic)
      let { address } = config;
      let factory: Address | undefined;
      let factoryData: Hex | undefined;
      const deploySalt =
        config.deploySalt ??
        ('0x0000000000000000000000000000000000000000000000000000000000000001' as Hex);

      // Derive counterfactual address if not explicitly provided
      if (!address) {
        // Find the owner EOA from keyring or external signer
        let owner: Address | undefined;
        if (keyringVat) {
          const accounts = await E(keyringVat).getAccounts();
          if (accounts.length > 0) {
            owner = accounts[0];
          }
        }
        if (!owner && externalSigner) {
          const accounts = await E(externalSigner).getAccounts();
          if (accounts.length > 0) {
            owner = accounts[0];
          }
        }
        if (!owner) {
          throw new Error(
            'No owner account available to derive smart account address',
          );
        }

        const env = resolveEnvironment(config.chainId);
        factory = env.SimpleFactory;

        const derived = await computeSmartAccountAddress({
          owner,
          deploySalt,
          chainId: config.chainId,
        });
        address = derived.address;
        factoryData = derived.factoryData;
      }

      smartAccountConfig = harden({
        implementation: 'hybrid' as const,
        deploySalt,
        address,
        factory,
        factoryData,
        deployed: false,
      });
      persistBaggage('smartAccountConfig', smartAccountConfig);
      return smartAccountConfig;
    },

    async getSmartAccountAddress(): Promise<Address | undefined> {
      return smartAccountConfig?.address;
    },

    // ------------------------------------------------------------------
    // Public wallet API
    // ------------------------------------------------------------------

    async getAccounts(): Promise<Address[]> {
      // When a peer wallet is connected, present only the peer (home)
      // accounts. The local throwaway key is an implementation detail
      // used internally for delegation signing.
      if (peerWallet) {
        return E(peerWallet).getAccounts();
      }

      const localAccounts: Address[] = keyringVat
        ? await E(keyringVat).getAccounts()
        : [];

      const extAccounts: Address[] = externalSigner
        ? await E(externalSigner).getAccounts()
        : [];

      // Deduplicate by lowercasing
      const seen = new Set(localAccounts.map((a) => a.toLowerCase()));
      const merged = [...localAccounts];
      for (const account of extAccounts) {
        if (!seen.has(account.toLowerCase())) {
          seen.add(account.toLowerCase());
          merged.push(account);
        }
      }
      return merged;
    },

    async signTransaction(tx: TransactionRequest): Promise<Hex> {
      return resolveTransactionSigning(tx);
    },

    async sendTransaction(tx: TransactionRequest): Promise<Hex> {
      if (!providerVat) {
        throw new Error('Provider not configured');
      }

      // Check if a delegation covers this action and bundler is configured
      if (delegationVat && bundlerConfig) {
        const delegation = await E(delegationVat).findDelegationForAction(
          { to: tx.to, value: tx.value, data: tx.data },
          bundlerConfig.chainId,
          Date.now(),
        );

        if (delegation) {
          if (delegation.status !== 'signed') {
            throw new Error(
              `Found delegation ${delegation.id} but its status is '${delegation.status}' (expected 'signed'). ` +
                `Direct signing is not used when a delegation exists, to avoid bypassing caveats.`,
            );
          }
          return submitDelegationUserOp({
            delegations: [delegation],
            execution: {
              target: tx.to,
              value: tx.value ?? ('0x0' as Hex),
              callData: tx.data ?? ('0x' as Hex),
            },
            maxFeePerGas: tx.maxFeePerGas,
            maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
          });
        }
      }

      // Estimate missing gas fields for direct (non-delegation) sends
      const filledTx = { ...tx };

      filledTx.nonce ??= await E(providerVat).getNonce(filledTx.from);
      filledTx.chainId ??= await E(providerVat).getChainId();
      if (!filledTx.maxFeePerGas || !filledTx.maxPriorityFeePerGas) {
        const fees = await E(providerVat).getGasFees();
        filledTx.maxFeePerGas ??= fees.maxFeePerGas;
        filledTx.maxPriorityFeePerGas ??= fees.maxPriorityFeePerGas;
      }
      filledTx.gasLimit ??= (await E(providerVat).request('eth_estimateGas', [
        {
          from: filledTx.from,
          to: filledTx.to,
          value: filledTx.value,
          data: filledTx.data,
        },
      ])) as Hex;

      const signedTx = await resolveTransactionSigning(filledTx);
      return E(providerVat).broadcastTransaction(signedTx);
    },

    async signTypedData(data: Eip712TypedData, from?: Address): Promise<Hex> {
      return resolveTypedDataSigning(data, from);
    },

    async signMessage(message: string, account?: Address): Promise<Hex> {
      return resolveMessageSigning(message, account);
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
      if (!delegationVat) {
        throw new Error('Delegation vat not available');
      }

      // Determine delegator and signing function.
      // When a smart account is configured, use its address as delegator
      // but sign with the underlying EOA key (the smart account's owner).
      let delegator: Address | undefined;
      let signTypedDataFn:
        | ((data: Eip712TypedData) => Promise<Hex>)
        | undefined;

      if (keyringVat) {
        const accounts = await E(keyringVat).getAccounts();
        if (accounts.length > 0) {
          delegator = smartAccountConfig?.address ?? accounts[0];
          const kv = keyringVat;
          signTypedDataFn = async (data: Eip712TypedData) =>
            E(kv).signTypedData(data);
        }
      }

      if (!delegator && externalSigner) {
        const accounts = await E(externalSigner).getAccounts();
        if (accounts.length > 0) {
          delegator = smartAccountConfig?.address ?? accounts[0];
          const ext = externalSigner;
          // Smart-account delegations are signed by the owner EOA, not the
          // smart-account address used as delegator in typed data.
          const from = accounts[0];
          signTypedDataFn = async (data: Eip712TypedData) =>
            E(ext).signTypedData(data, from);
        }
      }

      if (!delegator || !signTypedDataFn) {
        throw new Error('No accounts available to create delegation');
      }

      const delegation = await E(delegationVat).createDelegation({
        ...opts,
        delegator,
      });

      const typedData = await E(delegationVat).prepareDelegationForSigning(
        delegation.id,
      );

      const signature = await signTypedDataFn(typedData);

      await E(delegationVat).storeSigned(delegation.id, signature);

      return E(delegationVat).getDelegation(delegation.id);
    },

    async receiveDelegation(delegation: Delegation): Promise<void> {
      if (!delegationVat) {
        throw new Error('Delegation vat not available');
      }
      await E(delegationVat).receiveDelegation(delegation);
    },

    /**
     * Revoke a delegation locally. Note: this only removes the delegation
     * from the local store. It does NOT submit an on-chain revocation.
     * A party holding a copy of the signed delegation can still redeem it
     * on-chain until on-chain revocation is implemented.
     *
     * @param id - The delegation identifier.
     */
    async revokeDelegation(id: string): Promise<void> {
      if (!delegationVat) {
        throw new Error('Delegation vat not available');
      }
      await E(delegationVat).revokeDelegation(id);
    },

    async listDelegations(): Promise<Delegation[]> {
      if (!delegationVat) {
        throw new Error('Delegation vat not available');
      }
      return E(delegationVat).listDelegations();
    },

    // ------------------------------------------------------------------
    // Delegation redemption (ERC-4337)
    // ------------------------------------------------------------------

    async redeemDelegation(options: {
      execution: Execution;
      delegations?: Delegation[];
      delegationId?: string;
      action?: Action;
      maxFeePerGas?: Hex;
      maxPriorityFeePerGas?: Hex;
    }): Promise<Hex> {
      if (!delegationVat) {
        throw new Error('Delegation vat not available');
      }

      // Resolve the delegation chain
      let delegations: Delegation[];

      if (options.delegations && options.delegations.length > 0) {
        // Explicit delegation chain provided
        delegations = options.delegations;
      } else if (options.delegationId) {
        const delegation = await E(delegationVat).getDelegation(
          options.delegationId,
        );
        delegations = [delegation];
      } else if (options.action) {
        const delegation = await E(delegationVat).findDelegationForAction(
          options.action,
          bundlerConfig?.chainId,
          Date.now(),
        );
        if (!delegation) {
          throw new Error('No matching delegation found');
        }
        delegations = [delegation];
      } else {
        throw new Error('Must provide delegations, delegationId, or action');
      }

      // Validate all delegations in the chain are signed
      for (const delegation of delegations) {
        if (delegation.status !== 'signed') {
          throw new Error(
            `Delegation ${delegation.id} has status '${delegation.status}', expected 'signed'`,
          );
        }
      }

      return submitDelegationUserOp({
        delegations,
        execution: options.execution,
        maxFeePerGas: options.maxFeePerGas,
        maxPriorityFeePerGas: options.maxPriorityFeePerGas,
      });
    },

    async waitForUserOpReceipt(options: {
      userOpHash: Hex;
      pollIntervalMs?: number;
      timeoutMs?: number;
    }): Promise<unknown> {
      if (!providerVat || !bundlerConfig) {
        throw new Error('Provider and bundler must be configured');
      }

      if (
        typeof globalThis.Date?.now !== 'function' ||
        typeof globalThis.setTimeout !== 'function'
      ) {
        throw new Error(
          'waitForUserOpReceipt requires Date.now and setTimeout ' +
            '(not available in SES compartments without timer endowments)',
        );
      }

      const interval = options.pollIntervalMs ?? 2000;
      const timeout = options.timeoutMs ?? 60000;
      const start = Date.now();

      while (Date.now() - start < timeout) {
        const receipt = await E(providerVat).getUserOpReceipt({
          bundlerUrl: bundlerConfig.bundlerUrl,
          userOpHash: options.userOpHash,
        });
        if (receipt !== null) {
          return receipt;
        }
        await new Promise((resolve) => setTimeout(resolve, interval));
      }
      throw new Error(
        `UserOp ${options.userOpHash} not found after ${timeout}ms`,
      );
    },

    // ------------------------------------------------------------------
    // Peer wallet connectivity
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
          throw new Error(
            'Peer transaction signing is disabled; use delegation redemption',
          );

        case 'typedData':
          if (!request.data) {
            throw new Error('Missing typed data in signing request');
          }
          if (keyringVat) {
            const hasKeys = await E(keyringVat).hasKeys();
            if (hasKeys) {
              return E(keyringVat).signTypedData(request.data);
            }
          }
          if (externalSigner) {
            const accounts = await E(externalSigner).getAccounts();
            if (accounts.length > 0) {
              return E(externalSigner).signTypedData(
                request.data,
                request.account ?? accounts[0],
              );
            }
          }
          throw new Error('No signer available to handle signing request');

        case 'message':
          if (!request.message) {
            throw new Error('Missing message in signing request');
          }
          if (keyringVat) {
            const hasKeys = await E(keyringVat).hasKeys();
            if (hasKeys) {
              return E(keyringVat).signMessage(
                request.message,
                request.account,
              );
            }
          }
          if (externalSigner) {
            const accounts = await E(externalSigner).getAccounts();
            if (accounts.length > 0) {
              return E(externalSigner).signMessage(
                request.message,
                request.account ?? accounts[0],
              );
            }
          }
          throw new Error('No signer available to handle signing request');

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

      return harden({
        hasLocalKeys,
        localAccounts,
        delegationCount: delegations.length,
        hasPeerWallet: peerWallet !== undefined,
        hasExternalSigner: externalSigner !== undefined,
        hasBundlerConfig: bundlerConfig !== undefined,
        smartAccountAddress: smartAccountConfig?.address,
      });
    },
  });
  return coordinator;
}
