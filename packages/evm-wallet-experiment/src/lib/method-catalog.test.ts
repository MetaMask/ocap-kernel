import { describe, expect, it } from 'vitest';

import { METHOD_CATALOG } from './method-catalog.ts';

describe('method-catalog', () => {
  it('has entries for transferNative and transferFungible', () => {
    expect(METHOD_CATALOG).toHaveProperty('transferNative');
    expect(METHOD_CATALOG).toHaveProperty('transferFungible');
  });

  describe('transferNative', () => {
    it('has a valid MethodSchema', () => {
      expect(METHOD_CATALOG.transferNative).toStrictEqual({
        description: 'Transfer native ETH to a recipient.',
        args: {
          to: { type: 'string', description: 'Recipient address.' },
          amount: {
            type: 'string',
            description: 'Amount in wei (bigint as string).',
          },
        },
        returns: { type: 'string', description: 'Transaction hash.' },
      });
    });
  });

  describe('transferFungible', () => {
    it('has a valid MethodSchema', () => {
      expect(METHOD_CATALOG.transferFungible).toStrictEqual({
        description: 'Transfer ERC-20 tokens to a recipient.',
        args: {
          token: { type: 'string', description: 'Token contract address.' },
          to: { type: 'string', description: 'Recipient address.' },
          amount: {
            type: 'string',
            description: 'Amount in token units (bigint as string).',
          },
        },
        returns: { type: 'string', description: 'Transaction hash.' },
      });
    });
  });
});
