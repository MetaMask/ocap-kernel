import type {
  RemotableSpec,
  ServiceDescription,
} from '@metamask/service-discovery-types';
import { describe, expect, it } from 'vitest';

import { extractServiceTokens, rankServices, tokenize } from './match.ts';

const makeService = (options: {
  description: string;
  methods?: string[];
}): ServiceDescription => {
  const methods: RemotableSpec['methods'] = {};
  for (const name of options.methods ?? []) {
    methods[name] = {
      parameters: [],
      returnType: { kind: 'void' },
    };
  }
  return {
    description: options.description,
    apiSpec: {
      properties: {
        service: {
          type: { kind: 'remotable', spec: { methods } },
        },
      },
    },
    contact: [{ contactType: 'public', contactUrl: 'ocap:x@p' }],
  };
};

describe('tokenize', () => {
  it.each([
    ['Sign a message with my wallet', ['sign', 'message', 'wallet']],
    ['signMessage', ['sign', 'message']],
    ['getAccounts', ['get', 'accounts']],
    ['random-NUMBER service!', ['random', 'number', 'service']],
    ['  ', []],
    ['', []],
    // Stopwords drop out; 1-letter tokens drop out.
    ['I want to do X with my Y', ['want']],
  ] as [string, string[]][])('tokenizes %j', (input, expected) => {
    expect(tokenize(input)).toStrictEqual(expected);
  });
});

describe('extractServiceTokens', () => {
  it('combines description tokens with method-name tokens', () => {
    const tokens = extractServiceTokens(
      makeService({
        description: 'Personal message signer',
        methods: ['signMessage', 'getAccounts'],
      }),
    );
    expect(tokens).toStrictEqual(
      new Set(['personal', 'message', 'signer', 'sign', 'get', 'accounts']),
    );
  });

  it('returns description-only tokens when no methods are exposed', () => {
    const tokens = extractServiceTokens(
      makeService({ description: 'Echoes input back.' }),
    );
    expect(tokens).toStrictEqual(new Set(['echoes', 'input', 'back']));
  });
});

describe('rankServices', () => {
  const pms = makeService({
    description: 'Sign messages with the active wallet account',
    methods: ['signMessage', 'getAccounts'],
  });
  const echo = makeService({
    description: 'Echoes input back to the caller',
    methods: ['echo'],
  });
  const rng = makeService({
    description: 'Generates random numbers',
    methods: ['randomInt', 'randomFloat'],
  });

  it('returns empty when nothing overlaps', () => {
    expect(rankServices([pms, echo, rng], 'make me a sandwich')).toStrictEqual(
      [],
    );
  });

  it('returns only the matching service for a specific query', () => {
    const matches = rankServices(
      [pms, echo, rng],
      'sign a message with my wallet',
    );
    expect(matches.map((entry) => entry.description.description)).toStrictEqual(
      [pms.description],
    );
    expect(matches[0]?.matchedTokens).toStrictEqual(
      expect.arrayContaining(['sign', 'message', 'wallet']),
    );
  });

  it('matches via method names even when description tokens miss', () => {
    const matches = rankServices([pms, echo, rng], 'getAccounts');
    expect(matches.map((entry) => entry.description.description)).toStrictEqual(
      [pms.description],
    );
  });

  it('sorts by descending score, preserving insertion order on ties', () => {
    // Both echo and rng score 1 on this query (echo via "input", rng via
    // "random"). Insertion order is echo, rng — that order should hold.
    const matches = rankServices(
      [echo, rng],
      'I need random input from somewhere',
    );
    expect(matches.map((entry) => entry.description.description)).toStrictEqual(
      [echo.description, rng.description],
    );
    expect(matches.every((entry) => entry.score === 1)).toBe(true);
  });

  it('ranks higher-overlap services first', () => {
    const matches = rankServices(
      [echo, pms, rng],
      'sign messages and get accounts',
    );
    // pms hits sign + message + get + accounts (score 4), others hit nothing.
    expect(matches[0]?.description.description).toBe(pms.description);
    expect(matches[0]?.score).toBeGreaterThanOrEqual(3);
  });

  it('returns empty when query has no useful tokens', () => {
    expect(rankServices([pms], 'a the of to')).toStrictEqual([]);
  });
});
