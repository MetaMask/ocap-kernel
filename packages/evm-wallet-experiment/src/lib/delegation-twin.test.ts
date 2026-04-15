import { describe, expect, it, vi } from 'vitest';

import type { Address, DelegationGrant, Execution, Hex } from '../types.ts';
import { makeDelegationTwin } from './delegation-twin.ts';
import { encodeBalanceOf } from './erc20.ts';

let lastInterfaceGuard: unknown;

vi.mock('@metamask/kernel-utils/discoverable', () => ({
  makeDiscoverableExo: (
    _name: string,
    methods: Record<string, (...args: unknown[]) => unknown>,
    methodSchema: Record<string, unknown>,
    interfaceGuard?: unknown,
  ) => {
    lastInterfaceGuard = interfaceGuard;
    return {
      ...methods,
      __getDescription__: () => methodSchema,
    };
  },
}));

const ALICE = '0x1111111111111111111111111111111111111111' as Address;
const BOB = '0x2222222222222222222222222222222222222222' as Address;
const TOKEN = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;
const TX_HASH =
  '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as Hex;

function makeTransferGrant(max: bigint): DelegationGrant {
  return {
    delegation: {
      id: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      delegator: ALICE,
      delegate: BOB,
      authority:
        '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' as Hex,
      caveats: [],
      salt: '0x01' as Hex,
      chainId: 11155111,
      status: 'signed',
    },
    methodName: 'transfer',
    caveatSpecs: [{ type: 'cumulativeSpend' as const, token: TOKEN, max }],
    token: TOKEN,
  };
}

function makeCallGrant(): DelegationGrant {
  return {
    delegation: {
      id: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      delegator: ALICE,
      delegate: BOB,
      authority:
        '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' as Hex,
      caveats: [],
      salt: '0x01' as Hex,
      chainId: 11155111,
      status: 'signed',
    },
    methodName: 'call',
    caveatSpecs: [],
  };
}

describe('makeDelegationTwin', () => {
  describe('transfer twin', () => {
    it('exposes transfer method', () => {
      const redeemFn = vi.fn().mockResolvedValue(TX_HASH);
      const twin = makeDelegationTwin({
        grant: makeTransferGrant(10000n),
        redeemFn,
      }) as Record<string, unknown>;
      expect(twin).toHaveProperty('transfer');
      expect(typeof twin.transfer).toBe('function');
    });

    it('builds correct Execution and calls redeemFn', async () => {
      const redeemFn = vi.fn().mockResolvedValue(TX_HASH);
      const twin = makeDelegationTwin({
        grant: makeTransferGrant(10000n),
        redeemFn,
      }) as Record<string, (...args: unknown[]) => Promise<Hex>>;

      const result = await twin.transfer(BOB, 100n);
      expect(result).toBe(TX_HASH);
      expect(redeemFn).toHaveBeenCalledOnce();

      const execution = redeemFn.mock.calls[0]?.[0] as Execution;
      expect(execution.target).toBe(TOKEN);
      expect(execution.value).toBe('0x0');
    });

    it('returns tx hash from redeemFn', async () => {
      const redeemFn = vi.fn().mockResolvedValue(TX_HASH);
      const twin = makeDelegationTwin({
        grant: makeTransferGrant(10000n),
        redeemFn,
      }) as Record<string, (...args: unknown[]) => Promise<Hex>>;

      const hash = await twin.transfer(BOB, 50n);
      expect(hash).toBe(TX_HASH);
    });

    it('tracks cumulative spend across calls', async () => {
      const redeemFn = vi.fn().mockResolvedValue(TX_HASH);
      const twin = makeDelegationTwin({
        grant: makeTransferGrant(1000n),
        redeemFn,
      }) as Record<string, (...args: unknown[]) => Promise<Hex>>;

      await twin.transfer(BOB, 600n);
      await twin.transfer(BOB, 300n);
      await expect(twin.transfer(BOB, 200n)).rejects.toThrow(
        /Insufficient budget/u,
      );
    });

    it('rejects call when budget exhausted', async () => {
      const redeemFn = vi.fn().mockResolvedValue(TX_HASH);
      const twin = makeDelegationTwin({
        grant: makeTransferGrant(100n),
        redeemFn,
      }) as Record<string, (...args: unknown[]) => Promise<Hex>>;

      await twin.transfer(BOB, 100n);
      await expect(twin.transfer(BOB, 1n)).rejects.toThrow(
        /Insufficient budget/u,
      );
    });

    it('does not commit on redeemFn failure', async () => {
      const redeemFn = vi.fn().mockRejectedValue(new Error('tx reverted'));
      const twin = makeDelegationTwin({
        grant: makeTransferGrant(1000n),
        redeemFn,
      }) as Record<string, (...args: unknown[]) => Promise<Hex>>;

      await expect(twin.transfer(BOB, 500n)).rejects.toThrow('tx reverted');
      redeemFn.mockResolvedValue(TX_HASH);
      const result = await twin.transfer(BOB, 1000n);
      expect(result).toBe(TX_HASH);
    });

    it('does not allow concurrent calls to exceed the budget', async () => {
      // Two calls issued concurrently both pass the budget check before either
      // commits — unless the budget is reserved before the await. With a max of
      // 5 and two concurrent calls for 3, the second must be rejected even
      // though the first hasn't settled yet.
      let resolveFirst!: (hash: Hex) => void;
      const redeemFn = vi
        .fn()
        .mockImplementationOnce(
          async () =>
            new Promise<Hex>((resolve) => {
              resolveFirst = resolve;
            }),
        )
        .mockResolvedValue(TX_HASH);

      const twin = makeDelegationTwin({
        grant: makeTransferGrant(5n),
        redeemFn,
      }) as Record<string, (...args: unknown[]) => Promise<Hex>>;

      const first = twin.transfer(BOB, 3n);
      // Second call issued before first resolves — must see only 2 remaining.
      await expect(twin.transfer(BOB, 3n)).rejects.toThrow(
        'Insufficient budget',
      );
      resolveFirst(TX_HASH);
      expect(await first).toBe(TX_HASH);
    });
  });

  describe('discoverability', () => {
    it('returns method schemas from __getDescription__', () => {
      const redeemFn = vi.fn().mockResolvedValue(TX_HASH);
      const twin = makeDelegationTwin({
        grant: makeTransferGrant(1000n),
        redeemFn,
      }) as Record<string, unknown>;

      const desc = (twin.__getDescription__ as () => Record<string, unknown>)();
      expect(desc).toHaveProperty('transfer');
      expect(
        (desc.transfer as Record<string, unknown>).description,
      ).toBeDefined();
    });
  });

  describe('getBalance', () => {
    it('is present when readFn provided', () => {
      const redeemFn = vi.fn().mockResolvedValue(TX_HASH);
      const readFn = vi
        .fn()
        .mockResolvedValue(
          '0x00000000000000000000000000000000000000000000000000000000000f4240' as Hex,
        );
      const twin = makeDelegationTwin({
        grant: makeTransferGrant(1000n),
        redeemFn,
        readFn,
      }) as Record<string, unknown>;
      expect(twin).toHaveProperty('getBalance');
    });

    it('is absent when readFn not provided', () => {
      const redeemFn = vi.fn().mockResolvedValue(TX_HASH);
      const twin = makeDelegationTwin({
        grant: makeTransferGrant(1000n),
        redeemFn,
      }) as Record<string, unknown>;
      expect(twin).not.toHaveProperty('getBalance');
    });

    it('calls readFn with correct args and decodes result', async () => {
      const redeemFn = vi.fn().mockResolvedValue(TX_HASH);
      const readFn = vi
        .fn()
        .mockResolvedValue(
          '0x00000000000000000000000000000000000000000000000000000000000f4240' as Hex,
        );
      const twin = makeDelegationTwin({
        grant: makeTransferGrant(1000n),
        redeemFn,
        readFn,
      }) as Record<string, (...args: unknown[]) => Promise<bigint>>;

      const balance = await twin.getBalance();
      expect(balance).toBe(1000000n);
      expect(readFn).toHaveBeenCalledWith({
        to: TOKEN,
        data: encodeBalanceOf(ALICE),
      });
    });
  });

  describe('call twin', () => {
    it('builds raw execution from args', async () => {
      const redeemFn = vi.fn().mockResolvedValue(TX_HASH);
      const target = '0x3333333333333333333333333333333333333333' as Address;
      const twin = makeDelegationTwin({
        grant: makeCallGrant(),
        redeemFn,
      }) as Record<string, (...args: unknown[]) => Promise<Hex>>;

      await twin.call(target, 0n, '0xdeadbeef' as Hex);
      expect(redeemFn).toHaveBeenCalledOnce();
      const execution = redeemFn.mock.calls[0]?.[0] as Execution;
      expect(execution.target).toBe(target);
      expect(execution.callData).toBe('0xdeadbeef');
    });
  });

  describe('interfaceGuard', () => {
    it('passes an InterfaceGuard to makeDiscoverableExo', () => {
      const redeemFn = vi.fn().mockResolvedValue(TX_HASH);
      makeDelegationTwin({
        grant: makeTransferGrant(1000n),
        redeemFn,
      });
      expect(lastInterfaceGuard).toBeDefined();
    });

    it('guard covers the primary method', () => {
      const redeemFn = vi.fn().mockResolvedValue(TX_HASH);
      makeDelegationTwin({
        grant: makeTransferGrant(1000n),
        redeemFn,
      });
      const guard = lastInterfaceGuard as {
        payload: { methodGuards: Record<string, unknown> };
      };
      expect(guard.payload.methodGuards).toHaveProperty('transfer');
    });

    it('guard includes getBalance when readFn provided', () => {
      const redeemFn = vi.fn().mockResolvedValue(TX_HASH);
      const readFn = vi
        .fn()
        .mockResolvedValue(
          '0x00000000000000000000000000000000000000000000000000000000000f4240' as Hex,
        );
      makeDelegationTwin({
        grant: makeTransferGrant(1000n),
        redeemFn,
        readFn,
      });
      const guard = lastInterfaceGuard as {
        payload: { methodGuards: Record<string, unknown> };
      };
      expect(guard.payload.methodGuards).toHaveProperty('transfer');
      expect(guard.payload.methodGuards).toHaveProperty('getBalance');
    });

    it('guard does not include getBalance when readFn absent', () => {
      const redeemFn = vi.fn().mockResolvedValue(TX_HASH);
      makeDelegationTwin({
        grant: makeTransferGrant(1000n),
        redeemFn,
      });
      const guard = lastInterfaceGuard as {
        payload: { methodGuards: Record<string, unknown> };
      };
      expect(guard.payload.methodGuards).not.toHaveProperty('getBalance');
    });

    it('uses generic string guard for address arg by default', () => {
      const redeemFn = vi.fn().mockResolvedValue(TX_HASH);
      makeDelegationTwin({
        grant: makeTransferGrant(1000n),
        redeemFn,
      });
      const guard = lastInterfaceGuard as {
        payload: {
          methodGuards: Record<string, { payload: { argGuards: unknown[] } }>;
        };
      };
      const argGuard = guard.payload.methodGuards.transfer.payload.argGuards[0];
      expect(typeof argGuard).not.toBe('string');
    });

    it('restricts address arg to literal when allowedCalldata caveat present', () => {
      const redeemFn = vi.fn().mockResolvedValue(TX_HASH);
      const grant = makeTransferGrant(1000n);
      grant.caveatSpecs.push({
        type: 'allowedCalldata' as const,
        dataStart: 4,
        value: `0x${BOB.slice(2).padStart(64, '0')}`,
      });
      makeDelegationTwin({ grant, redeemFn });
      const guard = lastInterfaceGuard as {
        payload: {
          methodGuards: Record<string, { payload: { argGuards: unknown[] } }>;
        };
      };
      const argGuard = guard.payload.methodGuards.transfer.payload.argGuards[0];
      expect(argGuard).toBe(BOB);
    });

    it('does not restrict address arg for call method', () => {
      const redeemFn = vi.fn().mockResolvedValue(TX_HASH);
      const grant = makeCallGrant();
      grant.caveatSpecs.push({
        type: 'allowedCalldata' as const,
        dataStart: 4,
        value: `0x${BOB.slice(2).padStart(64, '0')}`,
      });
      makeDelegationTwin({ grant, redeemFn });
      const guard = lastInterfaceGuard as {
        payload: {
          methodGuards: Record<string, { payload: { argGuards: unknown[] } }>;
        };
      };
      const argGuard = guard.payload.methodGuards.call.payload.argGuards[0];
      expect(typeof argGuard).not.toBe('string');
    });
  });
});
