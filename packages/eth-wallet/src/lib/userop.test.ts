import { describe, it, expect } from 'vitest';

import { encodeAllowedTargets, makeCaveat } from './caveats.ts';
import { finalizeDelegation, makeDelegation } from './delegation.ts';
import {
  buildDelegationUserOp,
  buildRedeemCallData,
  computeUserOpHash,
  encodeDelegationChain,
  encodeExecution,
  ENTRY_POINT_V07,
} from './userop.ts';
import type { Address, Execution, Hex } from '../types.ts';

const ALICE = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266' as Address;
const BOB = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' as Address;
const TARGET = '0x1234567890abcdef1234567890abcdef12345678' as Address;

const makeTestDelegation = () =>
  finalizeDelegation(
    makeDelegation({
      delegator: ALICE,
      delegate: BOB,
      caveats: [
        makeCaveat({
          type: 'allowedTargets',
          terms: encodeAllowedTargets([TARGET]),
        }),
      ],
      chainId: 1,
      salt: '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex,
    }),
    '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef00' as Hex,
  );

const makeTestExecution = (): Execution => ({
  target: TARGET,
  value: '0x0' as Hex,
  callData: '0xa9059cbb' as Hex,
});

describe('lib/userop', () => {
  describe('ENTRY_POINT_V07', () => {
    it('is the canonical v0.7 address', () => {
      expect(ENTRY_POINT_V07).toBe(
        '0x0000000071727de22e5e9d8baf0edac6f37da032',
      );
    });
  });

  describe('encodeDelegationChain', () => {
    it('encodes a single delegation', () => {
      const delegation = makeTestDelegation();
      const encoded = encodeDelegationChain([delegation]);

      expect(encoded).toMatch(/^0x/u);
      expect(encoded.length).toBeGreaterThan(2);
    });

    it('encodes an empty chain', () => {
      const encoded = encodeDelegationChain([]);

      expect(encoded).toMatch(/^0x/u);
    });
  });

  describe('encodeExecution', () => {
    it('encodes an execution struct', () => {
      const execution = makeTestExecution();
      const encoded = encodeExecution(execution);

      expect(encoded).toMatch(/^0x/u);
      expect(encoded.length).toBeGreaterThan(2);
    });
  });

  describe('buildRedeemCallData', () => {
    it('builds callData starting with redeemDelegations selector', () => {
      const delegation = makeTestDelegation();
      const execution = makeTestExecution();

      const callData = buildRedeemCallData({
        delegations: [delegation],
        execution,
      });

      expect(callData).toMatch(/^0x38c86720/u);
    });
  });

  describe('buildDelegationUserOp', () => {
    it('builds an unsigned UserOperation', () => {
      const delegation = makeTestDelegation();
      const execution = makeTestExecution();

      const userOp = buildDelegationUserOp({
        sender: BOB,
        nonce: '0x0' as Hex,
        delegations: [delegation],
        execution,
        maxFeePerGas: '0x3b9aca00' as Hex,
        maxPriorityFeePerGas: '0x3b9aca00' as Hex,
      });

      expect(userOp.sender).toBe(BOB);
      expect(userOp.nonce).toBe('0x0');
      expect(userOp.callData).toMatch(/^0x38c86720/u);
      expect(userOp.signature).toBe('0x');
    });

    it('uses custom gas limits when provided', () => {
      const delegation = makeTestDelegation();
      const execution = makeTestExecution();

      const userOp = buildDelegationUserOp({
        sender: BOB,
        nonce: '0x0' as Hex,
        delegations: [delegation],
        execution,
        maxFeePerGas: '0x3b9aca00' as Hex,
        maxPriorityFeePerGas: '0x3b9aca00' as Hex,
        gasLimits: {
          callGasLimit: '0x100000' as Hex,
        },
      });

      expect(userOp.callGasLimit).toBe('0x100000');
    });
  });

  describe('computeUserOpHash', () => {
    it('produces a deterministic hash', () => {
      const delegation = makeTestDelegation();
      const execution = makeTestExecution();

      const userOp = buildDelegationUserOp({
        sender: BOB,
        nonce: '0x0' as Hex,
        delegations: [delegation],
        execution,
        maxFeePerGas: '0x3b9aca00' as Hex,
        maxPriorityFeePerGas: '0x3b9aca00' as Hex,
      });

      const hash1 = computeUserOpHash(userOp, ENTRY_POINT_V07, 1);
      const hash2 = computeUserOpHash(userOp, ENTRY_POINT_V07, 1);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^0x[\da-f]{64}$/u);
    });

    it('produces different hashes for different chain IDs', () => {
      const delegation = makeTestDelegation();
      const execution = makeTestExecution();

      const userOp = buildDelegationUserOp({
        sender: BOB,
        nonce: '0x0' as Hex,
        delegations: [delegation],
        execution,
        maxFeePerGas: '0x3b9aca00' as Hex,
        maxPriorityFeePerGas: '0x3b9aca00' as Hex,
      });

      const hash1 = computeUserOpHash(userOp, ENTRY_POINT_V07, 1);
      const hash2 = computeUserOpHash(userOp, ENTRY_POINT_V07, 11155111);

      expect(hash1).not.toBe(hash2);
    });
  });
});
