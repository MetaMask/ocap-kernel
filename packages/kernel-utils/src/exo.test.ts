import { describe, it, expect } from 'vitest';

import { makeDefaultExo, makeDefaultInterface } from './exo.ts';

describe('exo', () => {
  describe('makeDefaultInterface', () => {
    it('makes a default interface', () => {
      const interfaceGuard = makeDefaultInterface('TestInterface');
      expect(interfaceGuard).toBeDefined();
    });

    it('can be used to make an exo', () => {
      const exo = makeDefaultExo(
        'TestExo',
        { method: () => 'foo' },
        makeDefaultInterface('TestExo'),
      );
      expect(exo).toBeDefined();
    });
  });

  describe('makeDefaultExo', () => {
    it('makes an exo', () => {
      const exo = makeDefaultExo('TestExo', { method: () => 'foo' });
      expect(exo).toBeDefined();
    });
  });
});
