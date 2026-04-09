import {
  encodeAllowedCalldata,
  encodeAllowedMethods,
  encodeAllowedTargets,
  encodeErc20TransferAmount,
  encodeTimestamp,
  encodeValueLte,
  makeCaveat,
} from './caveats.ts';
import { makeDelegation } from './delegation.ts';
import {
  ERC20_APPROVE_SELECTOR,
  ERC20_TRANSFER_SELECTOR,
  FIRST_ARG_OFFSET,
} from './erc20.ts';
import type {
  Address,
  Caveat,
  CaveatSpec,
  DelegationGrant,
  Hex,
} from '../types.ts';

const harden = globalThis.harden ?? (<T>(value: T): T => value);

/**
 * Encode an address as a 32-byte ABI-encoded word (left-padded with zeros).
 *
 * @param address - The Ethereum address to encode.
 * @returns The 0x-prefixed 32-byte hex string.
 */
function abiEncodeAddress(address: Address): Hex {
  return `0x${address.slice(2).toLowerCase().padStart(64, '0')}`;
}

type TransferOptions = {
  delegator: Address;
  delegate: Address;
  token: Address;
  max: bigint;
  chainId: number;
  validUntil?: number;
  recipient?: Address;
  entropy?: Hex;
};

type ApproveOptions = {
  delegator: Address;
  delegate: Address;
  token: Address;
  max: bigint;
  chainId: number;
  validUntil?: number;
  spender?: Address;
  entropy?: Hex;
};

type CallOptions = {
  delegator: Address;
  delegate: Address;
  targets: Address[];
  chainId: number;
  maxValue?: bigint;
  validUntil?: number;
  entropy?: Hex;
};

export function buildDelegationGrant(
  method: 'transfer',
  options: TransferOptions,
): DelegationGrant;
export function buildDelegationGrant(
  method: 'approve',
  options: ApproveOptions,
): DelegationGrant;
export function buildDelegationGrant(
  method: 'call',
  options: CallOptions,
): DelegationGrant;
/**
 * Build an unsigned delegation grant for the given method.
 *
 * @param method - The catalog method name.
 * @param options - Method-specific options.
 * @returns An unsigned DelegationGrant.
 */
export function buildDelegationGrant(
  method: 'transfer' | 'approve' | 'call',
  options: TransferOptions | ApproveOptions | CallOptions,
): DelegationGrant {
  switch (method) {
    case 'transfer':
      return buildTransferGrant(options as TransferOptions);
    case 'approve':
      return buildApproveGrant(options as ApproveOptions);
    case 'call':
      return buildCallGrant(options as CallOptions);
    default:
      throw new Error(`Unknown method: ${String(method)}`);
  }
}

type Erc20GrantOptions = {
  methodName: 'transfer' | 'approve';
  selector: Hex;
  delegator: Address;
  delegate: Address;
  token: Address;
  max: bigint;
  chainId: number;
  validUntil?: number;
  restrictedAddress?: Address;
  entropy?: Hex;
};

/**
 * Build a delegation grant for an ERC-20 method (transfer or approve).
 *
 * @param options - ERC-20 grant options.
 * @param options.methodName - The catalog method name ('transfer' or 'approve').
 * @param options.selector - The ERC-20 function selector.
 * @param options.delegator - The delegating account address.
 * @param options.delegate - The delegate account address.
 * @param options.token - The ERC-20 token contract address.
 * @param options.max - The maximum token amount allowed.
 * @param options.chainId - The chain ID.
 * @param options.validUntil - Optional Unix timestamp after which the delegation expires.
 * @param options.restrictedAddress - Optional address to lock the first argument to.
 * @param options.entropy - Optional entropy for delegation salt.
 * @returns An unsigned DelegationGrant for the given ERC-20 method.
 */
function buildErc20Grant({
  methodName,
  selector,
  delegator,
  delegate,
  token,
  max,
  chainId,
  validUntil,
  restrictedAddress,
  entropy,
}: Erc20GrantOptions): DelegationGrant {
  const caveats: Caveat[] = [
    makeCaveat({
      type: 'allowedTargets',
      terms: encodeAllowedTargets([token]),
      chainId,
    }),
    makeCaveat({
      type: 'allowedMethods',
      terms: encodeAllowedMethods([selector]),
      chainId,
    }),
    makeCaveat({
      type: 'erc20TransferAmount',
      terms: encodeErc20TransferAmount({ token, amount: max }),
      chainId,
    }),
  ];

  const caveatSpecs: CaveatSpec[] = [{ type: 'cumulativeSpend', token, max }];

  if (restrictedAddress !== undefined) {
    const value = abiEncodeAddress(restrictedAddress);
    caveats.push(
      makeCaveat({
        type: 'allowedCalldata',
        terms: encodeAllowedCalldata({ dataStart: FIRST_ARG_OFFSET, value }),
        chainId,
      }),
    );
    caveatSpecs.push({
      type: 'allowedCalldata',
      dataStart: FIRST_ARG_OFFSET,
      value,
    });
  }

  if (validUntil !== undefined) {
    caveats.push(
      makeCaveat({
        type: 'timestamp',
        terms: encodeTimestamp({ after: 0, before: validUntil }),
        chainId,
      }),
    );
    caveatSpecs.push({
      type: 'blockWindow',
      after: 0n,
      before: BigInt(validUntil),
    });
  }

  const delegation = makeDelegation({
    delegator,
    delegate,
    caveats,
    chainId,
    entropy,
  });

  return harden({ delegation, methodName, caveatSpecs, token });
}

/**
 * Build a transfer delegation grant.
 *
 * @param options - Transfer grant options.
 * @returns An unsigned DelegationGrant for ERC-20 transfers.
 */
function buildTransferGrant(options: TransferOptions): DelegationGrant {
  return buildErc20Grant({
    ...options,
    methodName: 'transfer',
    selector: ERC20_TRANSFER_SELECTOR,
    restrictedAddress: options.recipient,
  });
}

/**
 * Build an approve delegation grant.
 *
 * @param options - Approve grant options.
 * @returns An unsigned DelegationGrant for ERC-20 approvals.
 */
function buildApproveGrant(options: ApproveOptions): DelegationGrant {
  return buildErc20Grant({
    ...options,
    methodName: 'approve',
    selector: ERC20_APPROVE_SELECTOR,
    restrictedAddress: options.spender,
  });
}

/**
 * Build a raw call delegation grant.
 *
 * @param options - Call grant options.
 * @returns An unsigned DelegationGrant for raw calls.
 */
function buildCallGrant(options: CallOptions): DelegationGrant {
  const {
    delegator,
    delegate,
    targets,
    chainId,
    maxValue,
    validUntil,
    entropy,
  } = options;
  const caveats: Caveat[] = [
    makeCaveat({
      type: 'allowedTargets',
      terms: encodeAllowedTargets(targets),
      chainId,
    }),
  ];

  const caveatSpecs: CaveatSpec[] = [];

  if (maxValue !== undefined) {
    caveats.push(
      makeCaveat({
        type: 'valueLte',
        terms: encodeValueLte(maxValue),
        chainId,
      }),
    );
    caveatSpecs.push({ type: 'valueLte', max: maxValue });
  }

  if (validUntil !== undefined) {
    caveats.push(
      makeCaveat({
        type: 'timestamp',
        terms: encodeTimestamp({ after: 0, before: validUntil }),
        chainId,
      }),
    );
  }

  const delegation = makeDelegation({
    delegator,
    delegate,
    caveats,
    chainId,
    entropy,
  });

  return harden({ delegation, methodName: 'call', caveatSpecs });
}
