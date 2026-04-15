import { describe, expect, it } from 'vitest';

import type { Address, Hex } from '../types.ts';
import {
  decodeTransferCalldata,
  encodeApprove,
  ERC20_APPROVE_SELECTOR,
  ERC20_TRANSFER_SELECTOR,
} from './erc20.ts';
import { METHOD_CATALOG, GET_BALANCE_SCHEMA } from './method-catalog.ts';

const TOKEN = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;
const BOB = '0x2222222222222222222222222222222222222222' as Address;

describe('method-catalog', () => {
  it('has entries for transfer, approve, and call', () => {
    expect(METHOD_CATALOG).toHaveProperty('transfer');
    expect(METHOD_CATALOG).toHaveProperty('approve');
    expect(METHOD_CATALOG).toHaveProperty('call');
  });

  describe('transfer', () => {
    it('has the correct selector', () => {
      expect(METHOD_CATALOG.transfer.selector).toBe(ERC20_TRANSFER_SELECTOR);
    });

    it('builds correct ERC-20 transfer execution', () => {
      const execution = METHOD_CATALOG.transfer.buildExecution(TOKEN, [
        BOB,
        5000n,
      ]);
      expect(execution.target).toBe(TOKEN);
      expect(execution.value).toBe('0x0');
      const decoded = decodeTransferCalldata(execution.callData);
      expect(decoded.to.toLowerCase()).toBe(BOB.toLowerCase());
      expect(decoded.amount).toBe(5000n);
    });

    it('has a valid MethodSchema', () => {
      expect(METHOD_CATALOG.transfer.schema.description).toBeDefined();
      expect(METHOD_CATALOG.transfer.schema.args).toHaveProperty('to');
      expect(METHOD_CATALOG.transfer.schema.args).toHaveProperty('amount');
      expect(METHOD_CATALOG.transfer.schema.returns).toBeDefined();
    });
  });

  describe('approve', () => {
    it('has the correct selector', () => {
      expect(METHOD_CATALOG.approve.selector).toBe(ERC20_APPROVE_SELECTOR);
    });

    it('builds correct ERC-20 approve execution', () => {
      const execution = METHOD_CATALOG.approve.buildExecution(TOKEN, [
        BOB,
        1000n,
      ]);
      expect(execution.target).toBe(TOKEN);
      expect(execution.value).toBe('0x0');
      expect(execution.callData).toBe(encodeApprove(BOB, 1000n));
    });

    it('has a valid MethodSchema', () => {
      expect(METHOD_CATALOG.approve.schema.description).toBeDefined();
      expect(METHOD_CATALOG.approve.schema.args).toHaveProperty('spender');
      expect(METHOD_CATALOG.approve.schema.args).toHaveProperty('amount');
    });
  });

  describe('call', () => {
    it('has no selector', () => {
      expect(METHOD_CATALOG.call.selector).toBeUndefined();
    });

    it('passes through raw args', () => {
      const target = '0x3333333333333333333333333333333333333333' as Address;
      const callData = '0xdeadbeef' as Hex;
      const execution = METHOD_CATALOG.call.buildExecution(TOKEN, [
        target,
        100n,
        callData,
      ]);
      expect(execution.target).toBe(target);
      expect(execution.value).toBe('0x64');
      expect(execution.callData).toBe(callData);
    });

    it('has a valid MethodSchema', () => {
      expect(METHOD_CATALOG.call.schema.description).toBeDefined();
      expect(METHOD_CATALOG.call.schema.args).toHaveProperty('target');
      expect(METHOD_CATALOG.call.schema.args).toHaveProperty('value');
      expect(METHOD_CATALOG.call.schema.args).toHaveProperty('data');
    });
  });

  describe('GET_BALANCE_SCHEMA', () => {
    it('describes a read-only method', () => {
      expect(GET_BALANCE_SCHEMA.description).toBeDefined();
      expect(GET_BALANCE_SCHEMA.args).toStrictEqual({});
      expect(GET_BALANCE_SCHEMA.returns).toBeDefined();
    });
  });
});
