import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type { Baggage } from '@metamask/ocap-kernel';

import {
  buildSdkDisableCallData,
  buildSdkRedeemCallData,
  computeSmartAccountAddress,
  isEip7702Delegated,
  prepareUserOpTypedData,
  resolveEnvironment,
} from '../lib/sdk.ts';
import { ENTRY_POINT_V07 } from '../lib/userop.ts';
import type {
  Action,
  Address,
  Caveat,
  ChainConfig,
  CreateDelegationOptions,
  Delegation,
  DelegationMatchResult,
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
 * Convert a wei amount in hex to a human-readable ETH string.
 *
 * @param weiHex - The wei amount as a hex string.
 * @returns A formatted string like "1.5 ETH".
 */
function weiToEth(weiHex: string): string {
  const wei = BigInt(weiHex);
  const whole = wei / 10n ** 18n;
  const frac = wei % 10n ** 18n;
  if (frac === 0n) {
    return `${String(whole)} ETH`;
  }
  const fracStr = frac.toString().padStart(18, '0').replace(/0+$/u, '');
  return `${String(whole)}.${fracStr} ETH`;
}

/**
 * Convert a caveat to a human-readable description.
 *
 * @param caveat - The caveat to describe.
 * @returns A human-readable string describing the caveat's constraint.
 */
function describeCaveat(caveat: Caveat): string {
  switch (caveat.type) {
    case 'nativeTokenTransferAmount':
      return `total spend limit: ${weiToEth(caveat.terms)}`;
    case 'valueLte':
      return `max per tx: ${weiToEth(caveat.terms)}`;
    case 'allowedTargets':
      return 'restricted target addresses';
    case 'allowedMethods':
      return 'restricted methods';
    case 'limitedCalls':
      return 'limited number of calls';
    case 'timestamp':
      return 'time-limited';
    case 'erc20TransferAmount':
      return 'ERC-20 transfer limit';
    default:
      return `${String(caveat.type)} enforced`;
  }
}

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
  initialize: (
    options: { type: string; mnemonic?: string },
    password?: string,
    salt?: string,
  ) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  isLocked: () => Promise<boolean>;
  hasKeys: () => Promise<boolean>;
  getAccounts: () => Promise<Address[]>;
  deriveAccount: (index: number) => Promise<Address>;
  signTransaction: (tx: TransactionRequest) => Promise<Hex>;
  signTypedData: (data: Eip712TypedData) => Promise<Hex>;
  signMessage: (message: string, from?: Address) => Promise<Hex>;
  signHash: (hash: Hex, from?: Address) => Promise<Hex>;
  signAuthorization: (options: {
    contractAddress: Address;
    chainId: number;
    nonce?: number;
    from?: Address;
  }) => Promise<unknown>;
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
  getUserOperationGasPrice: () => Promise<{
    fast: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
  }>;
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
  explainActionMatch: (
    action: Action,
    chainId?: number,
    currentTime?: number,
  ) => Promise<{ delegationId: string; result: DelegationMatchResult }[]>;
  getDelegation: (id: string) => Promise<Delegation>;
  listDelegations: () => Promise<Delegation[]>;
  revokeDelegation: (id: string) => Promise<void>;
};

type PeerWalletFacet = {
  getAccounts: () => Promise<Address[]>;
  getCapabilities: () => Promise<WalletCapabilities>;
  handleSigningRequest: (request: {
    type: string;
    tx?: TransactionRequest;
    data?: Eip712TypedData;
    message?: string;
    account?: Address;
  }) => Promise<Hex>;
  registerAwayWallet: (awayRef: unknown) => Promise<void>;
  registerDelegateAddress: (address: string) => Promise<void>;
};

type ExternalSignerFacet = {
  getAccounts: () => Promise<Address[]>;
  signTypedData: (data: Eip712TypedData, from: Address) => Promise<Hex>;
  signMessage: (message: string, from: Address) => Promise<Hex>;
  signTransaction: (tx: TransactionRequest) => Promise<Hex>;
};

type AwayWalletFacet = {
  receiveDelegation: (delegation: Delegation) => Promise<void>;
  revokeDelegationLocally: (id: string) => Promise<void>;
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

  // Away wallet reference (set via registerAwayWallet from the away device).
  // Note: like externalSigner, this is a transient CapTP reference — it will
  // be stale after kernel restart. The baggage entry is restored but the
  // remote endpoint may be gone. pushDelegationToAway() will fail at call
  // time if the reference is dead.
  let awayWallet: AwayWalletFacet | undefined;

  // Delegate address sent by the away device for delegation creation
  let pendingDelegateAddress: Address | undefined;

  // Cached peer (home) accounts for offline autonomy
  let cachedPeerAccounts: Address[] = [];
  // Cached peer signing mode for offline autonomy
  let cachedPeerSigningMode: string | undefined;

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
  if (baggage.has('awayWallet')) {
    awayWallet = baggage.get('awayWallet') as AwayWalletFacet;
  }
  if (baggage.has('pendingDelegateAddress')) {
    pendingDelegateAddress = baggage.get('pendingDelegateAddress') as Address;
  }
  if (baggage.has('cachedPeerAccounts')) {
    cachedPeerAccounts = baggage.get('cachedPeerAccounts') as Address[];
  }
  if (baggage.has('cachedPeerSigningMode')) {
    cachedPeerSigningMode = baggage.get('cachedPeerSigningMode') as string;
  }

  /**
   * Check if an address belongs to the cached peer (home) accounts.
   *
   * @param address - The Ethereum address to check.
   * @returns True if the address is a cached peer account.
   */
  function isPeerAccount(address: Address): boolean {
    return cachedPeerAccounts.some(
      (a) => a.toLowerCase() === address.toLowerCase(),
    );
  }

  const PEER_TIMEOUT_MS = 5000;

  /**
   * Race a promise against a timeout.
   *
   * @param promise - The promise to race.
   * @param ms - Timeout in milliseconds.
   * @returns The resolved value of the promise.
   */
  async function raceWithTimeout<T>(
    promise: Promise<T>,
    ms: number,
  ): Promise<T> {
    if (typeof globalThis.setTimeout !== 'function') {
      return promise;
    }
    return Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        globalThis.setTimeout(() => {
          reject(new Error(`Peer call timed out after ${String(ms)}ms`));
        }, ms);
      }),
    ]);
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
    // If the requested address belongs to the home device, route to peer
    if (from && isPeerAccount(from)) {
      if (peerWallet) {
        return E(peerWallet).handleSigningRequest({
          type: 'typedData',
          data,
        });
      }
      throw new Error(
        `Cannot sign typed data as ${from}: home device is offline and this address requires home signing authority`,
      );
    }

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
    // If the requested address belongs to the home device, route to peer
    if (from && isPeerAccount(from)) {
      if (peerWallet) {
        return E(peerWallet).handleSigningRequest({
          type: 'message',
          message,
          account: from,
        });
      }
      throw new Error(
        `Cannot sign message as ${from}: home device is offline and this address requires home signing authority`,
      );
    }

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
   * Build, sign, and submit a UserOp. Shared pipeline for both delegation
   * redemption and on-chain delegation revocation.
   *
   * @param options - Pipeline options.
   * @param options.sender - The smart account address that sends the UserOp.
   * @param options.callData - The encoded callData for the UserOp.
   * @param options.maxFeePerGas - Optional max fee per gas override.
   * @param options.maxPriorityFeePerGas - Optional max priority fee per gas override.
   * @returns The UserOp hash from the bundler.
   */
  async function buildAndSubmitUserOp(options: {
    sender: Address;
    callData: Hex;
    maxFeePerGas?: Hex;
    maxPriorityFeePerGas?: Hex;
  }): Promise<Hex> {
    if (!providerVat) {
      throw new Error('Provider vat not available');
    }
    if (!bundlerConfig) {
      throw new Error('Bundler not configured');
    }

    const { sender, callData } = options;

    // Get gas prices from the bundler (pimlico_getUserOperationGasPrice)
    // which returns prices the bundler will accept, avoiding rejection
    // due to stale node-reported fees.
    let { maxFeePerGas, maxPriorityFeePerGas } = options;
    if (!maxFeePerGas || !maxPriorityFeePerGas) {
      const gasPrice = await E(providerVat).getUserOperationGasPrice();
      maxFeePerGas = maxFeePerGas ?? gasPrice.fast.maxFeePerGas;
      maxPriorityFeePerGas =
        maxPriorityFeePerGas ?? gasPrice.fast.maxPriorityFeePerGas;
    }

    // Get nonce from EntryPoint contract (ERC-4337 nonce)
    const nonceHex = await E(providerVat).getEntryPointNonce({
      entryPoint: bundlerConfig.entryPoint,
      sender,
    });

    // Detect signing mode: check smartAccountConfig first, then fall back
    // to on-chain code inspection. This ensures the correct signing mode
    // even if smartAccountConfig is lost from baggage.
    let isStateless7702 =
      smartAccountConfig?.implementation === 'stateless7702';

    // Always fetch on-chain code — needed for both factory detection and
    // signing mode fallback.
    const onChainCode = (await E(providerVat).request('eth_getCode', [
      sender,
      'latest',
    ])) as string | undefined;

    if (typeof onChainCode !== 'string') {
      throw new Error(
        `eth_getCode for ${sender} returned ${String(onChainCode)}; check provider configuration`,
      );
    }

    // Fall back to on-chain code detection for 7702 accounts that weren't
    // configured via smartAccountConfig (e.g., restored from stale baggage).
    // Any EIP-7702 designator prefix (0xef0100) indicates a Stateless7702
    // DeleGator, which uses a different EIP-712 domain name for signing.
    if (!isStateless7702 && onChainCode.toLowerCase().startsWith('0xef0100')) {
      isStateless7702 = true;
    }

    // Check on-chain whether the smart account is deployed (eth_getCode).
    // This avoids relying on a cached flag that could be stale if the
    // deployment UserOp failed on-chain.
    let includeFactory = false;
    if (
      !isStateless7702 &&
      smartAccountConfig?.factory &&
      smartAccountConfig.factoryData
    ) {
      includeFactory = onChainCode === '0x' || onChainCode === '0x0';

      if (!includeFactory && smartAccountConfig.deployed === false) {
        smartAccountConfig = harden({
          ...smartAccountConfig,
          deployed: true,
        });
        persistBaggage('smartAccountConfig', smartAccountConfig);
      }
    }

    // Build unsigned UserOp with a dummy 65-byte signature so that the
    // smart account's validateUserOp can parse the ECDSA signature during
    // bundler/paymaster simulation. An empty signature (0x) causes revert.
    const unsignedUserOp: UserOperation = {
      sender,
      nonce: nonceHex,
      callData,
      callGasLimit: '0x50000' as Hex,
      verificationGasLimit: '0x60000' as Hex,
      preVerificationGas: '0x10000' as Hex,
      maxFeePerGas,
      maxPriorityFeePerGas,
      signature:
        '0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c' as Hex,
      ...(includeFactory && smartAccountConfig
        ? {
            factory: smartAccountConfig.factory as Hex,
            factoryData: smartAccountConfig.factoryData as Hex,
          }
        : {}),
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

    // Sign the UserOp via EIP-712 typed data. Both Hybrid and Stateless7702
    // DeleGators validate signatures using EIP-712 — the only difference is
    // the domain name.
    const userOpTypedData = prepareUserOpTypedData({
      userOp: userOpWithGas,
      entryPoint: bundlerConfig.entryPoint,
      chainId: bundlerConfig.chainId,
      smartAccountAddress: sender,
      ...(isStateless7702
        ? { smartAccountName: 'EIP7702StatelessDeleGator' }
        : {}),
    });
    const signature: Hex = await resolveTypedDataSigning(userOpTypedData);

    // Attach signature and submit
    const signedUserOp: UserOperation = {
      ...userOpWithGas,
      signature,
    };

    return E(providerVat).submitUserOp({
      bundlerUrl: bundlerConfig.bundlerUrl,
      entryPoint: bundlerConfig.entryPoint,
      userOp: signedUserOp,
    });
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
    maxFeePerGas?: Hex | undefined;
    maxPriorityFeePerGas?: Hex | undefined;
  }): Promise<Hex> {
    const sender =
      smartAccountConfig?.address ?? options.delegations[0].delegate;

    const sdkCallData = buildSdkRedeemCallData({
      delegations: options.delegations,
      execution: options.execution,
      chainId: bundlerConfig?.chainId ?? 1,
    });

    const userOpOptions: {
      sender: Address;
      callData: Hex;
      maxFeePerGas?: Hex;
      maxPriorityFeePerGas?: Hex;
    } = { sender, callData: sdkCallData };
    if (options.maxFeePerGas) {
      userOpOptions.maxFeePerGas = options.maxFeePerGas;
    }
    if (options.maxPriorityFeePerGas) {
      userOpOptions.maxPriorityFeePerGas = options.maxPriorityFeePerGas;
    }

    return buildAndSubmitUserOp(userOpOptions);
  }

  /**
   * Submit a UserOp that calls `DelegationManager.disableDelegation` to
   * revoke a delegation on-chain. The UserOp is sent from the delegator's
   * smart account.
   *
   * @param delegation - The delegation to disable.
   * @returns The UserOp hash from the bundler.
   */
  async function submitDisableUserOp(delegation: Delegation): Promise<Hex> {
    const sender = smartAccountConfig?.address ?? delegation.delegator;

    const disableCallData = buildSdkDisableCallData({
      delegation,
      chainId: bundlerConfig?.chainId ?? 1,
    });

    try {
      return await buildAndSubmitUserOp({
        sender,
        callData: disableCallData,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to submit on-chain revocation for delegator ${delegation.delegator}: ${message}`,
      );
    }
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
    if (!providerVat) {
      throw new Error('Provider vat required for EIP-7702 authorization');
    }

    // Resolve EOA address: keyring first, then external signer.
    let eoaAddress: Address | undefined;
    if (keyringVat) {
      const accounts = await E(keyringVat).getAccounts();
      if (accounts.length > 0) {
        eoaAddress = accounts[0];
      }
    }
    if (!eoaAddress && externalSigner) {
      const accounts = await E(externalSigner).getAccounts();
      if (accounts.length > 0) {
        eoaAddress = accounts[0];
      }
    }
    if (!eoaAddress) {
      throw new Error('No accounts available for EIP-7702 smart account');
    }

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

    // EIP-7702 promotion requires signAuthorization which is only
    // available on the local keyring (not supported by external signers).
    if (!keyringVat || !(await E(keyringVat).hasKeys())) {
      throw new Error(
        'EIP-7702 promotion requires a local keyring with initialized keys. ' +
          'Use implementation: "hybrid", or promote the account through MetaMask first.',
      );
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

    // Fetch the EOA nonce, gas fees, and sign the authorization in parallel.
    // EIP-7702 self-execution: the tx sender is the same EOA as the
    // authorization authority. The sender's nonce is incremented by the tx
    // validity check BEFORE authorizations are processed, so the
    // authorization nonce must be txNonce + 1.
    const EIP7702_AUTH_GAS_LIMIT = '0x19000' as Hex; // 102400
    const [nonce, fees] = await Promise.all([
      E(providerVat).getNonce(eoaAddress),
      E(providerVat).getGasFees(),
    ]);
    const signedAuth = await E(keyringVat).signAuthorization({
      contractAddress: implAddress as Address,
      chainId,
      nonce: nonce + 1,
    });

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
      password?: string;
      salt?: string;
    }): Promise<void> {
      if (!keyringVat) {
        throw new Error('Keyring vat not available');
      }
      const initOptions =
        options.type === 'srp'
          ? { type: 'srp' as const, mnemonic: options.mnemonic ?? '' }
          : { type: 'throwaway' as const, entropy: options.entropy };

      const password = options.type === 'srp' ? options.password : undefined;
      await E(keyringVat).initialize(initOptions, password, options.salt);
    },

    async unlockKeyring(password: string): Promise<void> {
      if (!keyringVat) {
        throw new Error('Keyring vat not available');
      }
      await E(keyringVat).unlock(password);
    },

    async isKeyringLocked(): Promise<boolean> {
      if (!keyringVat) {
        throw new Error('Keyring vat not available');
      }
      return E(keyringVat).isLocked();
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
      // When a peer wallet is connected, try to fetch live accounts.
      // Fall back to cached peer accounts if the peer is unreachable.
      if (peerWallet) {
        try {
          const liveAccounts: Address[] = await raceWithTimeout(
            E(peerWallet).getAccounts(),
            PEER_TIMEOUT_MS,
          );
          // Refresh the cache on success
          cachedPeerAccounts = liveAccounts;
          persistBaggage('cachedPeerAccounts', cachedPeerAccounts);
          return liveAccounts;
        } catch {
          if (cachedPeerAccounts.length > 0) {
            return cachedPeerAccounts;
          }
          // No cache — fall through to local accounts
        }
      }

      // Return cached peer accounts if available (peer may have disconnected)
      if (cachedPeerAccounts.length > 0) {
        return cachedPeerAccounts;
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
        const action: Action = {
          to: tx.to,
          value: tx.value,
          data: tx.data,
        };
        const now = Date.now();
        const delegation = await E(delegationVat).findDelegationForAction(
          action,
          bundlerConfig.chainId,
          now,
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

        // No delegation matched — explain why before falling through
        const explanations = await E(delegationVat).explainActionMatch(
          action,
          bundlerConfig.chainId,
          now,
        );
        if (explanations.length > 0) {
          const reasons = explanations
            .filter(
              (entry: {
                delegationId: string;
                result: DelegationMatchResult;
              }) => !entry.result.matches,
            )
            .map(
              (entry: {
                delegationId: string;
                result: DelegationMatchResult;
              }) =>
                `delegation ${entry.delegationId.slice(0, 10)}…: ${entry.result.reason ?? 'unknown'} (caveat: ${entry.result.failedCaveat ?? 'n/a'})`,
            );
          const valueDesc = tx.value
            ? `${BigInt(tx.value)} wei (${Number(BigInt(tx.value)) / 1e18} ETH)`
            : 'no value';
          throw new Error(
            `No delegation covers this transaction (to: ${tx.to}, value: ${valueDesc}). ` +
              `${reasons.length} delegation(s) checked: ${reasons.join('; ')}`,
          );
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

    /**
     * Look up a transaction by hash. Tries the bundler first (in case the
     * hash is a UserOp hash from delegation redemption), then falls back
     * to a regular `eth_getTransactionReceipt` RPC call.
     *
     * @param hash - A UserOp hash or regular tx hash.
     * @returns An object with `txHash` and `receipt`, or null if not found.
     */
    async getTransactionReceipt(hash: Hex): Promise<{
      txHash: Hex;
      userOpHash?: Hex;
      success: boolean;
    } | null> {
      if (!providerVat) {
        throw new Error('Provider not configured');
      }

      // Try bundler first (UserOp hash)
      if (bundlerConfig) {
        try {
          const userOpReceipt = (await E(providerVat).getUserOpReceipt({
            bundlerUrl: bundlerConfig.bundlerUrl,
            userOpHash: hash,
          })) as {
            success: boolean;
            receipt?: { transactionHash?: string };
          } | null;

          if (userOpReceipt?.receipt?.transactionHash) {
            return harden({
              txHash: userOpReceipt.receipt.transactionHash as Hex,
              userOpHash: hash,
              success: userOpReceipt.success,
            });
          }
        } catch {
          // Not a UserOp hash — fall through to regular RPC
        }
      }

      // Try regular tx receipt
      const receipt = (await E(providerVat).request(
        'eth_getTransactionReceipt',
        [hash],
      )) as { status?: string; transactionHash?: string } | null;

      if (receipt?.transactionHash) {
        return harden({
          txHash: receipt.transactionHash as Hex,
          success: receipt.status === '0x1',
        });
      }

      return null;
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
     * Mark a delegation as revoked in the local store without submitting
     * an on-chain transaction. Used by the home device to propagate
     * revocations to the away device over CapTP.
     *
     * @param id - The delegation identifier.
     */
    async revokeDelegationLocally(id: string): Promise<void> {
      if (!delegationVat) {
        throw new Error('Delegation vat not available');
      }
      // Silently ignore if the delegation doesn't exist locally
      // (the away device may not have received it yet).
      try {
        const delegation = await E(delegationVat).getDelegation(id);
        if (delegation.status !== 'revoked') {
          await E(delegationVat).revokeDelegation(id);
        }
      } catch {
        // Delegation not found locally — nothing to revoke.
      }
    },

    /**
     * Revoke a delegation on-chain by submitting a UserOp that calls
     * `DelegationManager.disableDelegation`. Blocks until the UserOp is
     * confirmed on-chain, then updates the local delegation status.
     *
     * Requires the bundler to be configured. The delegator's smart account
     * submits the UserOp (gas is covered by the paymaster if configured).
     *
     * @param id - The delegation identifier.
     * @returns The UserOp hash of the on-chain revocation transaction.
     */
    async revokeDelegation(id: string): Promise<Hex> {
      if (!delegationVat) {
        throw new Error('Delegation vat not available');
      }

      const delegation = await E(delegationVat).getDelegation(id);
      if (delegation.status === 'revoked') {
        throw new Error(`Delegation ${id} is already revoked`);
      }
      if (delegation.status !== 'signed') {
        throw new Error(
          `Delegation ${id} has status '${delegation.status}', expected 'signed'`,
        );
      }

      // Verify this wallet controls the delegator address
      const accounts = await coordinator.getAccounts();
      const delegatorLower = delegation.delegator.toLowerCase();
      const smartAccountLower = smartAccountConfig?.address?.toLowerCase();
      const isOwned =
        accounts.some((a: string) => a.toLowerCase() === delegatorLower) ||
        smartAccountLower === delegatorLower;
      if (!isOwned) {
        throw new Error(
          `Cannot revoke delegation ${id}: delegator ${delegation.delegator} is not controlled by this wallet`,
        );
      }

      // Submit on-chain disable
      const userOpHash = await submitDisableUserOp(delegation);

      // Wait for on-chain confirmation and check success
      const receipt = (await coordinator.waitForUserOpReceipt({
        userOpHash,
      })) as { success?: boolean } | null;
      if (receipt && receipt.success === false) {
        throw new Error(
          `On-chain revocation reverted for delegation ${id} (userOpHash: ${userOpHash})`,
        );
      }

      // Update local status after on-chain confirmation
      await E(delegationVat).revokeDelegation(id);

      return userOpHash;
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
        const now = Date.now();
        const delegation = await E(delegationVat).findDelegationForAction(
          options.action,
          bundlerConfig?.chainId,
          now,
        );
        if (!delegation) {
          const explanations = await E(delegationVat).explainActionMatch(
            options.action,
            bundlerConfig?.chainId,
            now,
          );
          const reasons = explanations
            .filter(
              (entry: {
                delegationId: string;
                result: DelegationMatchResult;
              }) => !entry.result.matches,
            )
            .map(
              (entry: {
                delegationId: string;
                result: DelegationMatchResult;
              }) =>
                `delegation ${entry.delegationId.slice(0, 10)}…: ${entry.result.reason ?? 'unknown'} (caveat: ${entry.result.failedCaveat ?? 'n/a'})`,
            );
          throw new Error(
            `No matching delegation found. ` +
              `${explanations.length} delegation(s) checked: ${reasons.join('; ')}`,
          );
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

      // Cache the peer accounts for offline autonomy
      try {
        cachedPeerAccounts = await E(peerWallet).getAccounts();
        persistBaggage('cachedPeerAccounts', cachedPeerAccounts);
      } catch {
        // Peer may not be ready yet; accounts can be cached later
        // via refreshPeerAccounts()
      }

      // Register this coordinator as the away wallet on the home device
      // so the home can push delegations directly over CapTP.
      try {
        await E(peerWallet).registerAwayWallet(coordinator);
      } catch {
        // Home device may not support registerAwayWallet yet (older version).
        // Delegation transfer falls back to copy-paste. The error is not
        // surfaced because vats have no logging facility; the user can detect
        // this via getCapabilities() on the home side (hasAwayWallet: false).
      }
    },

    async refreshPeerAccounts(): Promise<Address[]> {
      if (!peerWallet) {
        throw new Error('No peer wallet connected');
      }
      cachedPeerAccounts = await E(peerWallet).getAccounts();
      persistBaggage('cachedPeerAccounts', cachedPeerAccounts);
      return cachedPeerAccounts;
    },

    async registerAwayWallet(awayRef: unknown): Promise<void> {
      if (!awayRef || typeof awayRef !== 'object') {
        throw new Error(
          'Invalid away wallet reference: must be a non-null object',
        );
      }
      awayWallet = awayRef as AwayWalletFacet;
      persistBaggage('awayWallet', awayWallet);
    },

    async pushDelegationToAway(
      delegation: Delegation,
      revokeIds?: string[],
    ): Promise<void> {
      if (!awayWallet) {
        throw new Error(
          'No away wallet registered. The away device must connect first.',
        );
      }

      // Revoke old delegations on the away device first so it stops using them
      if (revokeIds && revokeIds.length > 0) {
        for (const id of revokeIds) {
          await E(awayWallet).revokeDelegationLocally(id);
        }
      }

      await E(awayWallet).receiveDelegation(delegation);
    },

    async registerDelegateAddress(address: string): Promise<void> {
      if (
        !address ||
        typeof address !== 'string' ||
        !/^0x[\da-f]{40}$/iu.test(address)
      ) {
        throw new Error(
          'Invalid delegate address: must be a 0x-prefixed 40-hex-char string',
        );
      }
      pendingDelegateAddress = address as Address;
      persistBaggage('pendingDelegateAddress', pendingDelegateAddress);
    },

    async getDelegateAddress(): Promise<Address | undefined> {
      return pendingDelegateAddress;
    },

    async sendDelegateAddressToPeer(address: string): Promise<void> {
      if (!peerWallet) {
        throw new Error('No peer wallet connected');
      }
      await E(peerWallet).registerDelegateAddress(address);
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

      const allDelegations: Delegation[] = delegationVat
        ? await E(delegationVat).listDelegations()
        : [];
      const activeDelegations = allDelegations.filter(
        (del) => del.status === 'signed',
      );

      // Resolve the signing mode so consumers (including AI agents) know
      // how signing works and whether user approval is needed.
      // Peer wallet takes priority — when present, it is the actual signing
      // authority (the local throwaway key is an implementation detail).
      let signingMode: string = 'none';
      if (peerWallet) {
        try {
          const peerCaps = await raceWithTimeout(
            E(peerWallet).getCapabilities(),
            PEER_TIMEOUT_MS,
          );
          signingMode = `peer:${peerCaps.signingMode ?? 'unknown'}`;
          cachedPeerSigningMode = signingMode;
          persistBaggage('cachedPeerSigningMode', cachedPeerSigningMode);
        } catch {
          signingMode = cachedPeerSigningMode ?? 'peer:unknown';
        }
      } else if (externalSigner) {
        signingMode = 'external:metamask';
      } else if (hasLocalKeys) {
        signingMode = 'local';
      }

      // Build human-readable delegation summaries so AI agents understand
      // what they can do autonomously without further user approval.
      const delegationInfos = activeDelegations.map((del) => ({
        id: del.id,
        delegator: del.delegator,
        delegate: del.delegate,
        caveats: del.caveats.map((cav) => ({
          type: cav.type,
          humanReadable: describeCaveat(cav),
        })),
      }));

      // Determine the agent's autonomy level based on delegations.
      // When delegations exist, the agent can send ETH within the
      // delegation's limits without requiring further user approval.
      let autonomy: string;
      if (activeDelegations.length > 0 && bundlerConfig) {
        const limits = activeDelegations
          .flatMap((del) => del.caveats)
          .map(describeCaveat)
          .filter(Boolean);
        const base =
          limits.length > 0
            ? `autonomous within limits: ${limits.join('; ')}`
            : 'autonomous (no spending limits)';
        autonomy =
          cachedPeerAccounts.length > 0 ? `${base} (offline-capable)` : base;
      } else if (peerWallet) {
        autonomy = 'requires peer wallet approval for each action';
      } else {
        autonomy = 'no signing authority';
      }

      return harden({
        hasLocalKeys,
        localAccounts,
        delegationCount: activeDelegations.length,
        delegations: delegationInfos,
        hasPeerWallet: peerWallet !== undefined,
        hasExternalSigner: externalSigner !== undefined,
        hasBundlerConfig: bundlerConfig !== undefined,
        smartAccountAddress: smartAccountConfig?.address,
        chainId: bundlerConfig?.chainId,
        signingMode,
        autonomy,
        peerAccountsCached: cachedPeerAccounts.length > 0,
        cachedPeerAccounts,
        hasAwayWallet: awayWallet !== undefined,
      });
    },
  });
  return coordinator;
}
