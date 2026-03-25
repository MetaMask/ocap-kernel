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
import { ERC20_APPROVE_SELECTOR, ERC20_TRANSFER_SELECTOR } from './erc20.ts';
import type {
  Address,
  Caveat,
  CaveatSpec,
  DelegationGrant,
  Hex,
} from '../types.ts';

const harden = globalThis.harden ?? (<T>(value: T): T => value);

/**
 * Byte offset of the first argument in ABI-encoded calldata (after the
 * 4-byte function selector).
 */
const FIRST_ARG_OFFSET = 4;

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
};

type ApproveOptions = {
  delegator: Address;
  delegate: Address;
  token: Address;
  max: bigint;
  chainId: number;
  validUntil?: number;
  spender?: Address;
};

type CallOptions = {
  delegator: Address;
  delegate: Address;
  targets: Address[];
  chainId: number;
  maxValue?: bigint;
  validUntil?: number;
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

/**
 * Build a transfer delegation grant.
 *
 * @param options - Transfer grant options.
 * @returns An unsigned DelegationGrant for ERC-20 transfers.
 */
function buildTransferGrant(options: TransferOptions): DelegationGrant {
  const { delegator, delegate, token, max, chainId, validUntil, recipient } =
    options;
  const caveats: Caveat[] = [
    makeCaveat({
      type: 'allowedTargets',
      terms: encodeAllowedTargets([token]),
      chainId,
    }),
    makeCaveat({
      type: 'allowedMethods',
      terms: encodeAllowedMethods([ERC20_TRANSFER_SELECTOR]),
      chainId,
    }),
    makeCaveat({
      type: 'erc20TransferAmount',
      terms: encodeErc20TransferAmount({ token, amount: max }),
      chainId,
    }),
  ];

  const caveatSpecs: CaveatSpec[] = [{ type: 'cumulativeSpend', token, max }];

  if (recipient !== undefined) {
    const value = abiEncodeAddress(recipient);
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

  const delegation = makeDelegation({ delegator, delegate, caveats, chainId });

  return harden({ delegation, methodName: 'transfer', caveatSpecs, token });
}

/**
 * Build an approve delegation grant.
 *
 * @param options - Approve grant options.
 * @returns An unsigned DelegationGrant for ERC-20 approvals.
 */
function buildApproveGrant(options: ApproveOptions): DelegationGrant {
  const { delegator, delegate, token, max, chainId, validUntil, spender } =
    options;
  const caveats: Caveat[] = [
    makeCaveat({
      type: 'allowedTargets',
      terms: encodeAllowedTargets([token]),
      chainId,
    }),
    makeCaveat({
      type: 'allowedMethods',
      terms: encodeAllowedMethods([ERC20_APPROVE_SELECTOR]),
      chainId,
    }),
    makeCaveat({
      type: 'erc20TransferAmount',
      terms: encodeErc20TransferAmount({ token, amount: max }),
      chainId,
    }),
  ];

  const caveatSpecs: CaveatSpec[] = [{ type: 'cumulativeSpend', token, max }];

  if (spender !== undefined) {
    const value = abiEncodeAddress(spender);
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

  const delegation = makeDelegation({ delegator, delegate, caveats, chainId });

  return harden({ delegation, methodName: 'approve', caveatSpecs, token });
}

/**
 * Build a raw call delegation grant.
 *
 * @param options - Call grant options.
 * @returns An unsigned DelegationGrant for raw calls.
 */
function buildCallGrant(options: CallOptions): DelegationGrant {
  const { delegator, delegate, targets, chainId, maxValue, validUntil } =
    options;
  const caveats: Caveat[] = [
    makeCaveat({
      type: 'allowedTargets',
      terms: encodeAllowedTargets(targets),
      chainId,
    }),
  ];

  if (maxValue !== undefined) {
    caveats.push(
      makeCaveat({
        type: 'valueLte',
        terms: encodeValueLte(maxValue),
        chainId,
      }),
    );
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

  const delegation = makeDelegation({ delegator, delegate, caveats, chainId });

  return harden({ delegation, methodName: 'call', caveatSpecs: [] });
}
