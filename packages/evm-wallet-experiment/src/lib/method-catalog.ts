import type { MethodSchema } from '@metamask/kernel-utils';

import type { Address, Execution, Hex } from '../types.ts';
import {
  encodeApprove,
  makeErc20TransferExecution,
  ERC20_TRANSFER_SELECTOR,
  ERC20_APPROVE_SELECTOR,
} from './erc20.ts';

const harden = globalThis.harden ?? (<T>(value: T): T => value);

type CatalogEntry = {
  selector: Hex | undefined;
  buildExecution: (token: Address, args: unknown[]) => Execution;
  schema: MethodSchema;
};

export type CatalogMethodName = 'transfer' | 'approve' | 'call';

export const METHOD_CATALOG: Record<CatalogMethodName, CatalogEntry> = harden({
  transfer: {
    selector: ERC20_TRANSFER_SELECTOR,
    buildExecution: (token: Address, args: unknown[]): Execution => {
      const [to, amount] = args as [Address, bigint];
      return makeErc20TransferExecution({ token, to, amount });
    },
    schema: {
      description: 'Transfer ERC-20 tokens to a recipient.',
      args: {
        to: { type: 'string', description: 'Recipient address.' },
        amount: {
          type: 'string',
          description: 'Token amount to transfer (bigint as string).',
        },
      },
      returns: { type: 'string', description: 'Transaction hash.' },
    },
  },
  approve: {
    selector: ERC20_APPROVE_SELECTOR,
    buildExecution: (token: Address, args: unknown[]): Execution => {
      const [spender, amount] = args as [Address, bigint];
      return harden({
        target: token,
        value: '0x0' as Hex,
        callData: encodeApprove(spender, amount),
      });
    },
    schema: {
      description: 'Approve a spender for ERC-20 tokens.',
      args: {
        spender: { type: 'string', description: 'Spender address.' },
        amount: {
          type: 'string',
          description: 'Allowance amount (bigint as string).',
        },
      },
      returns: { type: 'string', description: 'Transaction hash.' },
    },
  },
  call: {
    selector: undefined,
    buildExecution: (_token: Address, args: unknown[]): Execution => {
      const [target, value, callData] = args as [Address, bigint, Hex];
      return harden({
        target,
        value: `0x${value.toString(16)}`,
        callData,
      });
    },
    schema: {
      description: 'Execute a raw call via the delegation.',
      args: {
        target: { type: 'string', description: 'Target contract address.' },
        value: {
          type: 'string',
          description: 'ETH value in wei (bigint as string).',
        },
        data: { type: 'string', description: 'Calldata hex string.' },
      },
      returns: { type: 'string', description: 'Transaction hash.' },
    },
  },
});

export const GET_BALANCE_SCHEMA: MethodSchema = harden({
  description: 'Get the ERC-20 token balance for this delegation.',
  args: {},
  returns: { type: 'string', description: 'Token balance (bigint as string).' },
});
