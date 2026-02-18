import {
  keccak256,
  toHex,
  encodePacked,
  decodeAbiParameters,
  parseAbiParameters,
} from 'viem';

import { DELEGATION_TYPES, ROOT_AUTHORITY } from '../constants.ts';
import type {
  Action,
  Address,
  Caveat,
  Delegation,
  DelegationMatchResult,
  Eip712TypedData,
  Hex,
} from '../types.ts';

const harden = globalThis.harden ?? (<T>(value: T): T => value);

/**
 * Generate a deterministic delegation ID from its components.
 *
 * @param delegation - The delegation to compute the ID for.
 * @param delegation.delegator - The delegator address.
 * @param delegation.delegate - The delegate address.
 * @param delegation.authority - The parent delegation hash.
 * @param delegation.salt - The delegation salt.
 * @returns The delegation ID as a hex hash.
 */
export function computeDelegationId(delegation: {
  delegator: Address;
  delegate: Address;
  authority: Hex;
  salt: Hex;
}): string {
  return keccak256(
    encodePacked(
      ['address', 'address', 'bytes32', 'uint256'],
      [
        delegation.delegator,
        delegation.delegate,
        delegation.authority,
        BigInt(delegation.salt),
      ],
    ),
  );
}

/**
 * Generate a random salt for delegation uniqueness.
 *
 * @returns A hex-encoded random salt.
 */
export function generateSalt(): Hex {
  const bytes = new Uint8Array(32);
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  globalThis.crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/**
 * Create a new unsigned delegation struct.
 *
 * @param options - Creation options.
 * @param options.delegator - The account granting the delegation.
 * @param options.delegate - The account receiving the delegation.
 * @param options.caveats - The caveats restricting the delegation.
 * @param options.chainId - The chain ID.
 * @param options.salt - Optional salt (generated if omitted).
 * @param options.authority - Optional parent delegation hash (root if omitted).
 * @returns The unsigned Delegation struct.
 */
export function makeDelegation(options: {
  delegator: Address;
  delegate: Address;
  caveats: Caveat[];
  chainId: number;
  salt?: Hex;
  authority?: Hex;
}): Delegation {
  const salt = options.salt ?? generateSalt();
  const authority = options.authority ?? ROOT_AUTHORITY;

  const id = computeDelegationId({
    delegator: options.delegator,
    delegate: options.delegate,
    authority,
    salt,
  });

  return harden({
    id,
    delegator: options.delegator,
    delegate: options.delegate,
    authority,
    caveats: options.caveats,
    salt,
    chainId: options.chainId,
    status: 'pending',
  });
}

/**
 * Prepare the EIP-712 typed data payload for signing a delegation.
 *
 * @param options - Options.
 * @param options.delegation - The delegation to prepare for signing.
 * @param options.verifyingContract - The DelegationManager contract address.
 * @returns The EIP-712 typed data payload.
 */
export function prepareDelegationTypedData(options: {
  delegation: Delegation;
  verifyingContract: Address;
}): Eip712TypedData {
  const { delegation, verifyingContract } = options;

  return {
    domain: {
      name: 'DelegationManager',
      version: '1',
      chainId: delegation.chainId,
      verifyingContract,
    },
    types: {
      ...DELEGATION_TYPES,
    },
    primaryType: 'Delegation',
    message: {
      delegate: delegation.delegate,
      delegator: delegation.delegator,
      authority: delegation.authority,
      caveats: delegation.caveats.map((caveat) => ({
        enforcer: caveat.enforcer,
        terms: caveat.terms,
      })),
      salt: BigInt(delegation.salt).toString(),
    },
  };
}

/**
 * Explain whether a signed delegation potentially covers an action.
 *
 * Returns a detailed result indicating whether the delegation matches,
 * and if not, which caveat failed and why.
 *
 * This performs a client-side check based on the caveat types:
 * - allowedTargets: checks if action.to is in the allowed list
 * - allowedMethods: checks if action.data starts with an allowed selector
 * - valueLte: checks if action.value is within the limit
 * - timestamp: checks if current time is within the window
 * - erc20TransferAmount: checks token, selector, and amount
 *
 * This is a best-effort match. On-chain enforcement is authoritative.
 *
 * @param delegation - The delegation to check.
 * @param action - The action to match against.
 * @param currentTime - Optional current time in milliseconds (defaults to Date.now()).
 * @returns A result object with match status and failure details.
 */
export function explainDelegationMatch(
  delegation: Delegation,
  action: Action,
  currentTime?: number,
): DelegationMatchResult {
  if (delegation.status !== 'signed') {
    return { matches: false, reason: 'Delegation is not signed' };
  }

  // Check each caveat - all must pass for the delegation to match
  for (const caveat of delegation.caveats) {
    if (caveat.type === 'allowedTargets') {
      const [targets] = decodeAbiParameters(
        parseAbiParameters('address[]'),
        caveat.terms,
      );
      const match = targets.some(
        (target) => target.toLowerCase() === action.to.toLowerCase(),
      );
      if (!match) {
        return {
          matches: false,
          failedCaveat: 'allowedTargets',
          reason: `Target ${action.to} is not in the allowed targets list`,
        };
      }
    }

    if (caveat.type === 'allowedMethods' && action.data) {
      const selector = action.data.slice(0, 10).toLowerCase() as Hex;
      const [methods] = decodeAbiParameters(
        parseAbiParameters('bytes4[]'),
        caveat.terms,
      );
      const match = methods.some((method) => method.toLowerCase() === selector);
      if (!match) {
        return {
          matches: false,
          failedCaveat: 'allowedMethods',
          reason: `Method selector ${selector} is not in the allowed methods list`,
        };
      }
    }

    if (caveat.type === 'valueLte') {
      const [maxValue] = decodeAbiParameters(
        parseAbiParameters('uint256'),
        caveat.terms,
      );
      const actionValue = action.value ? BigInt(action.value) : 0n;
      if (actionValue > maxValue) {
        return {
          matches: false,
          failedCaveat: 'valueLte',
          reason: `Value ${actionValue} exceeds maximum ${maxValue}`,
        };
      }
    }

    if (caveat.type === 'timestamp') {
      const [after, before] = decodeAbiParameters(
        parseAbiParameters('uint128, uint128'),
        caveat.terms,
      );
      const now = BigInt(Math.floor((currentTime ?? Date.now()) / 1000));
      if (now < after) {
        return {
          matches: false,
          failedCaveat: 'timestamp',
          reason: `Current time ${now} is before the allowed window (starts at ${after})`,
        };
      }
      if (now > before) {
        return {
          matches: false,
          failedCaveat: 'timestamp',
          reason: `Current time ${now} is after the allowed window (ended at ${before})`,
        };
      }
    }

    if (caveat.type === 'erc20TransferAmount') {
      const [token, maxAmount] = decodeAbiParameters(
        parseAbiParameters('address, uint256'),
        caveat.terms,
      );
      if (action.to.toLowerCase() !== token.toLowerCase()) {
        return {
          matches: false,
          failedCaveat: 'erc20TransferAmount',
          reason: `Target ${action.to} does not match token contract ${token}`,
        };
      }
      if (!action.data || action.data.length < 138) {
        return {
          matches: false,
          failedCaveat: 'erc20TransferAmount',
          reason: 'Missing or incomplete ERC-20 transfer calldata',
        };
      }
      const selector = action.data.slice(0, 10).toLowerCase();
      if (selector !== '0xa9059cbb') {
        return {
          matches: false,
          failedCaveat: 'erc20TransferAmount',
          reason: `Selector ${selector} is not transfer(address,uint256)`,
        };
      }
      const amountHex = `0x${action.data.slice(74, 138)}`;
      const transferAmount = BigInt(amountHex);
      if (transferAmount > maxAmount) {
        return {
          matches: false,
          failedCaveat: 'erc20TransferAmount',
          reason: `Transfer amount ${transferAmount} exceeds maximum ${maxAmount}`,
        };
      }
    }

    // limitedCalls: Cannot enforce client-side (requires on-chain call counter).
    // The on-chain enforcer is authoritative — pass through.
  }

  return { matches: true };
}

/**
 * Check whether a signed delegation potentially covers an action.
 *
 * This is a convenience wrapper around {@link explainDelegationMatch}
 * that returns a simple boolean.
 *
 * @param delegation - The delegation to check.
 * @param action - The action to match against.
 * @param currentTime - Optional current time in milliseconds (defaults to Date.now()).
 * @returns True if the delegation might cover the action.
 */
export function delegationMatchesAction(
  delegation: Delegation,
  action: Action,
  currentTime?: number,
): boolean {
  return explainDelegationMatch(delegation, action, currentTime).matches;
}

/**
 * Mark a delegation as signed with the given signature.
 *
 * @param delegation - The delegation to finalize.
 * @param signature - The EIP-712 signature.
 * @returns The signed delegation.
 */
export function finalizeDelegation(
  delegation: Delegation,
  signature: Hex,
): Delegation {
  return harden({
    ...delegation,
    signature,
    status: 'signed',
  });
}
