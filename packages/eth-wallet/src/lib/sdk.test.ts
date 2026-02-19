import { describe, it, expect } from 'vitest';

import { encodeAllowedTargets, makeCaveat } from './caveats.ts';
import { finalizeDelegation, makeDelegation } from './delegation.ts';
import {
  buildSdkRedeemCallData,
  createSdkExecution,
  encodeSdkDelegations,
  fromSdkDelegation,
  getDelegationManagerAddress,
  getEnforcerAddresses,
  resolveEnvironment,
  toSdkDelegation,
} from './sdk.ts';
import type { SdkDelegation } from './sdk.ts';
import type { Address, Hex } from '../types.ts';

const ALICE = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266' as Address;
const BOB = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' as Address;
const TARGET = '0x1234567890abcdef1234567890abcdef12345678' as Address;
const SEPOLIA_CHAIN_ID = 11155111;

describe('lib/sdk', () => {
  describe('resolveEnvironment', () => {
    it('returns valid Sepolia environment', () => {
      const env = resolveEnvironment(SEPOLIA_CHAIN_ID);

      expect(env.DelegationManager).toMatch(/^0x[\da-f]{40}$/iu);
      expect(env.EntryPoint).toMatch(/^0x[\da-f]{40}$/iu);
      expect(env.SimpleFactory).toMatch(/^0x[\da-f]{40}$/iu);
      expect(env.implementations).toBeDefined();
      expect(env.caveatEnforcers).toBeDefined();
    });

    it('throws for unsupported chain', () => {
      expect(() => resolveEnvironment(99999)).toThrow('No contracts found');
    });
  });

  describe('getDelegationManagerAddress', () => {
    it('returns a valid address for Sepolia', () => {
      const address = getDelegationManagerAddress(SEPOLIA_CHAIN_ID);
      expect(address).toMatch(/^0x[\da-f]{40}$/iu);
    });
  });

  describe('getEnforcerAddresses', () => {
    it('returns enforcer addresses for Sepolia', () => {
      const enforcers = getEnforcerAddresses(SEPOLIA_CHAIN_ID);

      expect(enforcers.allowedTargets).toMatch(/^0x[\da-f]{40}$/iu);
      expect(enforcers.allowedMethods).toMatch(/^0x[\da-f]{40}$/iu);
      expect(enforcers.valueLte).toMatch(/^0x[\da-f]{40}$/iu);
      expect(enforcers.erc20TransferAmount).toMatch(/^0x[\da-f]{40}$/iu);
      expect(enforcers.limitedCalls).toMatch(/^0x[\da-f]{40}$/iu);
      expect(enforcers.timestamp).toMatch(/^0x[\da-f]{40}$/iu);
    });
  });

  describe('toSdkDelegation', () => {
    it('converts our delegation to SDK format', () => {
      const delegation = finalizeDelegation(
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
        '0xdeadbeef' as Hex,
      );

      const sdkDelegation = toSdkDelegation(delegation);

      expect(sdkDelegation.delegate).toBe(delegation.delegate);
      expect(sdkDelegation.delegator).toBe(delegation.delegator);
      expect(sdkDelegation.authority).toBe(delegation.authority);
      expect(sdkDelegation.salt).toBe(delegation.salt);
      expect(sdkDelegation.signature).toBe(delegation.signature);
      expect(sdkDelegation.caveats).toHaveLength(1);
      expect(sdkDelegation.caveats[0].enforcer).toBe(
        delegation.caveats[0].enforcer,
      );
      expect(sdkDelegation.caveats[0].terms).toBe(delegation.caveats[0].terms);
      expect(sdkDelegation.caveats[0].args).toBe('0x');
    });

    it('defaults signature to 0x for unsigned delegations', () => {
      const delegation = makeDelegation({
        delegator: ALICE,
        delegate: BOB,
        caveats: [],
        chainId: 1,
      });

      const sdkDelegation = toSdkDelegation(delegation);
      expect(sdkDelegation.signature).toBe('0x');
    });
  });

  describe('fromSdkDelegation', () => {
    it('converts SDK delegation to our format', () => {
      const sdkDelegation: SdkDelegation = {
        delegate: BOB,
        delegator: ALICE,
        authority:
          '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' as Hex,
        caveats: [],
        salt: '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex,
        signature: '0xdeadbeef' as Hex,
      };

      const delegation = fromSdkDelegation(sdkDelegation, 1, 'signed');

      expect(delegation.delegate).toBe(BOB);
      expect(delegation.delegator).toBe(ALICE);
      expect(delegation.chainId).toBe(1);
      expect(delegation.status).toBe('signed');
      expect(delegation.signature).toBe('0xdeadbeef');
      expect(delegation.id).toMatch(/^0x[\da-f]{64}$/iu);
    });

    it('omits signature when SDK delegation has 0x', () => {
      const sdkDelegation: SdkDelegation = {
        delegate: BOB,
        delegator: ALICE,
        authority:
          '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' as Hex,
        caveats: [],
        salt: '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex,
        signature: '0x' as Hex,
      };

      const delegation = fromSdkDelegation(sdkDelegation, 1);
      expect(delegation.signature).toBeUndefined();
      expect(delegation.status).toBe('pending');
    });
  });

  describe('type mapping round-trip', () => {
    it('preserves delegation data through toSdk → fromSdk', () => {
      const original = finalizeDelegation(
        makeDelegation({
          delegator: ALICE,
          delegate: BOB,
          caveats: [],
          chainId: 1,
          salt: '0x0000000000000000000000000000000000000000000000000000000000000042' as Hex,
        }),
        '0xdeadbeefdeadbeef' as Hex,
      );

      const sdkDelegation = toSdkDelegation(original);
      const roundTripped = fromSdkDelegation(sdkDelegation, 1, 'signed');

      expect(roundTripped.delegate).toBe(original.delegate);
      expect(roundTripped.delegator).toBe(original.delegator);
      expect(roundTripped.authority).toBe(original.authority);
      expect(roundTripped.salt).toBe(original.salt);
      expect(roundTripped.signature).toBe(original.signature);
      expect(roundTripped.id).toBe(original.id);
    });
  });

  describe('encodeSdkDelegations', () => {
    it('produces valid ABI output', () => {
      const delegation = finalizeDelegation(
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
        '0xdeadbeef' as Hex,
      );

      const encoded = encodeSdkDelegations([delegation]);

      expect(encoded).toMatch(/^0x/u);
      expect(encoded.length).toBeGreaterThan(2);
    });

    it('encodes an empty array', () => {
      const encoded = encodeSdkDelegations([]);

      expect(encoded).toMatch(/^0x/u);
    });
  });

  describe('buildSdkRedeemCallData', () => {
    it('produces callData starting with redeemDelegations selector', () => {
      const delegation = finalizeDelegation(
        makeDelegation({
          delegator: ALICE,
          delegate: BOB,
          caveats: [],
          chainId: 1,
          salt: '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex,
        }),
        '0xdeadbeef' as Hex,
      );

      const callData = buildSdkRedeemCallData({
        delegations: [delegation],
        execution: {
          target: TARGET,
          value: '0x0' as Hex,
          callData: '0x' as Hex,
        },
      });

      // The SDK's redeemDelegations function selector
      expect(callData).toMatch(/^0x[\da-f]{8}/u);
      expect(callData.length).toBeGreaterThan(10);
    });

    it('produces non-empty callData', () => {
      const delegation = finalizeDelegation(
        makeDelegation({
          delegator: ALICE,
          delegate: BOB,
          caveats: [],
          chainId: 1,
          salt: '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex,
        }),
        '0xdeadbeef' as Hex,
      );

      const callData = buildSdkRedeemCallData({
        delegations: [delegation],
        execution: {
          target: TARGET,
          value: '0x0' as Hex,
          callData: '0xa9059cbb' as Hex,
        },
      });

      expect(callData.length).toBeGreaterThan(10);
    });
  });

  describe('createSdkExecution', () => {
    it('creates an execution struct with defaults', () => {
      const execution = createSdkExecution({ target: TARGET });

      expect(execution.target).toBe(TARGET);
      expect(execution.value).toBe(0n);
      expect(execution.callData).toBe('0x');
    });

    it('creates an execution struct with explicit values', () => {
      const execution = createSdkExecution({
        target: TARGET,
        value: 1000000000000000000n,
        callData: '0xa9059cbb' as Hex,
      });

      expect(execution.target).toBe(TARGET);
      expect(execution.value).toBe(1000000000000000000n);
      expect(execution.callData).toBe('0xa9059cbb');
    });
  });
});
