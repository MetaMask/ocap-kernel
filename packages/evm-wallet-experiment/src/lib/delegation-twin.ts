import { M } from '@endo/patterns';
import type { MethodSchema } from '@metamask/kernel-utils';
import { makeDiscoverableExo } from '@metamask/kernel-utils/discoverable';

import { decodeBalanceOfResult, encodeBalanceOf } from './erc20.ts';
import { GET_BALANCE_SCHEMA, METHOD_CATALOG } from './method-catalog.ts';
import type { CatalogMethodName } from './method-catalog.ts';
import type {
  Address,
  CaveatSpec,
  DelegationGrant,
  Execution,
  Hex,
} from '../types.ts';

const METHOD_GUARDS: Record<
  CatalogMethodName,
  ReturnType<typeof M.callWhen>
> = {
  transfer: M.callWhen(M.string(), M.scalar()).returns(M.any()),
  approve: M.callWhen(M.string(), M.scalar()).returns(M.any()),
  call: M.callWhen(M.string(), M.scalar(), M.string()).returns(M.any()),
};

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

  const entry = METHOD_CATALOG[methodName as keyof typeof METHOD_CATALOG];
  if (!entry) {
    throw new Error(`Unknown method in grant: ${methodName}`);
  }

  const tracker = findSpendTracker(caveatSpecs);
  const { token } = grant;
  const idPrefix = delegation.id.slice(0, 12);

  const primaryMethod = async (...args: unknown[]): Promise<Hex> => {
    let trackAmount: bigint | undefined;
    if (tracker) {
      trackAmount = args[1] as bigint;
      if (trackAmount > tracker.remaining()) {
        throw new Error(
          `Insufficient budget: requested ${trackAmount}, remaining ${tracker.remaining()}`,
        );
      }
    }

    const execution = entry.buildExecution(token ?? ('' as Address), args);

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

  const methodGuards: Record<string, ReturnType<typeof M.callWhen>> = {
    [methodName]: METHOD_GUARDS[methodName as CatalogMethodName],
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
    methodGuards.getBalance = M.callWhen().returns(M.any());
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
