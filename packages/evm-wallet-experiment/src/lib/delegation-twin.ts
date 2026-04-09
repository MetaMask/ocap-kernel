import { M } from '@endo/patterns';
import type { MethodSchema } from '@metamask/kernel-utils';
import { makeDiscoverableExo } from '@metamask/kernel-utils/discoverable';

import {
  decodeBalanceOfResult,
  encodeBalanceOf,
  FIRST_ARG_OFFSET,
} from './erc20.ts';
import { GET_BALANCE_SCHEMA, METHOD_CATALOG } from './method-catalog.ts';
import type { CatalogMethodName } from './method-catalog.ts';
import type {
  Address,
  CaveatSpec,
  DelegationGrant,
  Execution,
  Hex,
} from '../types.ts';

const METHODS_WITH_ADDRESS_ARG: ReadonlySet<string> = new Set([
  'transfer',
  'approve',
]);

/**
 * Extract a restricted address from an `allowedCalldata` caveat spec that
 * pins the first argument (offset 4, 32-byte ABI-encoded address).
 *
 * @param caveatSpecs - The caveat specs to search.
 * @returns The restricted address, or undefined if none found.
 */
function findRestrictedAddress(caveatSpecs: CaveatSpec[]): Address | undefined {
  const spec = caveatSpecs.find(
    (cs): cs is CaveatSpec & { type: 'allowedCalldata' } =>
      cs.type === 'allowedCalldata' && cs.dataStart === FIRST_ARG_OFFSET,
  );
  if (!spec) {
    return undefined;
  }
  // The value is a 32-byte ABI-encoded address; extract the last 40 hex chars.
  return `0x${spec.value.slice(-40)}`;
}

/**
 * Build the method guard for a catalog method, optionally restricting the
 * first (address) argument to a single literal value.
 *
 * @param methodName - The catalog method name.
 * @param restrictAddress - If provided, lock the first arg to this literal.
 * @returns A method guard for use in an InterfaceGuard.
 */
function buildMethodGuard(
  methodName: CatalogMethodName,
  restrictAddress?: Address,
): ReturnType<typeof M.callWhen> {
  const addrGuard =
    restrictAddress !== undefined && METHODS_WITH_ADDRESS_ARG.has(methodName)
      ? restrictAddress
      : M.string();

  switch (methodName) {
    case 'transfer':
    case 'approve':
      return M.callWhen(addrGuard, M.scalar()).returns(M.string());
    case 'call':
      return M.callWhen(M.string(), M.scalar(), M.string()).returns(M.string());
    default:
      throw new Error(`Unknown catalog method: ${String(methodName)}`);
  }
}

type SpendTracker = {
  spent: bigint;
  max: bigint;
  remaining: () => bigint;
  commit: (amount: bigint) => void;
  rollback: (amount: bigint) => void;
};

/**
 * Create a spend tracker for a cumulative-spend caveat spec.
 *
 * @param spec - The cumulative-spend caveat spec.
 * @returns A spend tracker with commit/rollback semantics.
 */
function makeSpendTracker(
  spec: CaveatSpec & { type: 'cumulativeSpend' },
): SpendTracker {
  let spent = 0n;
  return {
    get spent() {
      return spent;
    },
    max: spec.max,
    remaining: () => spec.max - spent,
    commit: (amount: bigint) => {
      spent += amount;
    },
    rollback: (amount: bigint) => {
      spent -= amount;
    },
  };
}

/**
 * Find and create a spend tracker from a list of caveat specs.
 *
 * @param caveatSpecs - The caveat specs to search.
 * @returns A spend tracker if a cumulative-spend spec is found.
 */
function findSpendTracker(caveatSpecs: CaveatSpec[]): SpendTracker | undefined {
  const spec = caveatSpecs.find(
    (cs): cs is CaveatSpec & { type: 'cumulativeSpend' } =>
      cs.type === 'cumulativeSpend',
  );
  return spec ? makeSpendTracker(spec) : undefined;
}

type DelegationTwinOptions = {
  grant: DelegationGrant;
  redeemFn: (execution: Execution) => Promise<Hex>;
  readFn?: (opts: { to: Address; data: Hex }) => Promise<Hex>;
};

/**
 * Create a discoverable exo twin for a delegation grant.
 *
 * @param options - Twin construction options.
 * @param options.grant - The delegation grant to wrap.
 * @param options.redeemFn - Function to redeem a delegation execution.
 * @param options.readFn - Optional function for read-only calls.
 * @returns A discoverable exo with delegation methods.
 */
export function makeDelegationTwin(
  options: DelegationTwinOptions,
): ReturnType<typeof makeDiscoverableExo> {
  const { grant, redeemFn, readFn } = options;
  const { methodName, caveatSpecs, delegation } = grant;

  const entry = METHOD_CATALOG[methodName as CatalogMethodName];
  if (!entry) {
    throw new Error(`Unknown method in grant: ${methodName}`);
  }

  const tracker = findSpendTracker(caveatSpecs);
  const valueLteSpec = caveatSpecs.find(
    (cs): cs is CaveatSpec & { type: 'valueLte' } => cs.type === 'valueLte',
  );
  const { token } = grant;
  const idPrefix = delegation.id.slice(0, 12);

  const primaryMethod = async (...args: unknown[]): Promise<Hex> => {
    // Coerce args[1] (amount/value) to BigInt for transfer, approve, and call
    // — necessary when args arrive as strings over the daemon JSON-RPC boundary.
    const normalizedArgs =
      args.length > 1
        ? [
            args[0],
            BigInt(args[1] as string | number | bigint),
            ...args.slice(2),
          ]
        : args;

    // Local valueLte check for call twins (mirrors on-chain ValueLteEnforcer).
    if (valueLteSpec !== undefined) {
      const value = normalizedArgs[1] as bigint;
      if (value > valueLteSpec.max) {
        throw new Error(`Value ${value} exceeds limit ${valueLteSpec.max}`);
      }
    }

    let trackAmount: bigint | undefined;
    if (tracker) {
      trackAmount = normalizedArgs[1] as bigint;
      if (trackAmount > tracker.remaining()) {
        throw new Error(
          `Insufficient budget: requested ${trackAmount}, remaining ${tracker.remaining()}`,
        );
      }
    }

    const execution = entry.buildExecution(
      token ?? ('' as Address),
      normalizedArgs,
    );

    const txHash = await redeemFn(execution);
    if (tracker && trackAmount !== undefined) {
      tracker.commit(trackAmount);
    }
    return txHash;
  };

  const methods: Record<string, (...args: unknown[]) => unknown> = {
    [methodName]: primaryMethod,
  };
  const schema: Record<string, MethodSchema> = {
    [methodName]: entry.schema,
  };

  const restrictedAddress = findRestrictedAddress(caveatSpecs);

  const methodGuards: Record<string, ReturnType<typeof M.callWhen>> = {
    [methodName]: buildMethodGuard(
      methodName as CatalogMethodName,
      restrictedAddress,
    ),
  };

  if (readFn && token) {
    methods.getBalance = async (): Promise<bigint> => {
      const result = await readFn({
        to: token,
        data: encodeBalanceOf(delegation.delegate),
      });
      return decodeBalanceOfResult(result);
    };
    schema.getBalance = GET_BALANCE_SCHEMA;
    methodGuards.getBalance = M.callWhen().returns(M.bigint());
  }

  const interfaceGuard = M.interface(
    `DelegationTwin:${methodName}:${idPrefix}`,
    methodGuards,
    { defaultGuards: 'passable' },
  );

  return makeDiscoverableExo(
    `DelegationTwin:${methodName}:${idPrefix}`,
    methods,
    schema,
    interfaceGuard,
  );
}
