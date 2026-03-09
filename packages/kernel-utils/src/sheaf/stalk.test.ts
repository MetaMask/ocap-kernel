import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import type { MethodGuard } from '@endo/patterns';
import { describe, it, expect } from 'vitest';

import { getStalk } from './stalk.ts';
import type { PresheafSection, Section } from './types.ts';

const makePresheafSection = (
  tag: string,
  guards: Record<string, MethodGuard>,
  methods: Record<string, (...args: unknown[]) => unknown>,
  metadata: { cost: number },
): PresheafSection<{ cost: number }> => {
  const interfaceGuard = M.interface(tag, guards);
  const exo = makeExo(tag, interfaceGuard, methods);
  return { exo: exo as unknown as Section, metadata };
};

describe('getStalk', () => {
  it('returns matching sections for a method and args', () => {
    const sections = [
      makePresheafSection(
        'A',
        { add: M.call(M.number(), M.number()).returns(M.number()) },
        { add: (a: number, b: number) => a + b },
        { cost: 1 },
      ),
      makePresheafSection(
        'B',
        { add: M.call(M.number(), M.number()).returns(M.number()) },
        { add: (a: number, b: number) => a + b },
        { cost: 2 },
      ),
    ];

    const stalk = getStalk(sections, 'add', [1, 2]);
    expect(stalk).toHaveLength(2);
  });

  it('filters out sections without matching method', () => {
    const sections = [
      makePresheafSection(
        'A',
        { add: M.call(M.number()).returns(M.number()) },
        { add: (a: number) => a },
        { cost: 1 },
      ),
      makePresheafSection(
        'B',
        { sub: M.call(M.number()).returns(M.number()) },
        { sub: (a: number) => -a },
        { cost: 2 },
      ),
    ];

    const stalk = getStalk(sections, 'add', [1]);
    expect(stalk).toHaveLength(1);
    expect(stalk[0]!.metadata?.cost).toBe(1);
  });

  it('filters out sections with arg count mismatch', () => {
    const sections = [
      makePresheafSection(
        'A',
        { add: M.call(M.number(), M.number()).returns(M.number()) },
        { add: (a: number, b: number) => a + b },
        { cost: 1 },
      ),
    ];

    const stalk = getStalk(sections, 'add', [1]);
    expect(stalk).toHaveLength(0);
  });

  it('filters out sections with arg type mismatch', () => {
    const sections = [
      makePresheafSection(
        'A',
        { add: M.call(M.number()).returns(M.number()) },
        { add: (a: number) => a },
        { cost: 1 },
      ),
    ];

    const stalk = getStalk(sections, 'add', ['not-a-number']);
    expect(stalk).toHaveLength(0);
  });

  it('returns empty array when no sections match', () => {
    const sections = [
      makePresheafSection(
        'A',
        { add: M.call(M.eq('alice')).returns(M.number()) },
        { add: (_a: string) => 42 },
        { cost: 1 },
      ),
    ];

    const stalk = getStalk(sections, 'add', ['bob']);
    expect(stalk).toHaveLength(0);
  });

  it('matches sections with optional args when optional arg is provided', () => {
    const sections = [
      makePresheafSection(
        'A',
        {
          greet: M.callWhen(M.string())
            .optional(M.string())
            .returns(M.string()),
        },
        { greet: (name: string, _greeting?: string) => `hello ${name}` },
        { cost: 1 },
      ),
    ];

    expect(getStalk(sections, 'greet', ['alice'])).toHaveLength(1);
    expect(getStalk(sections, 'greet', ['alice', 'hi'])).toHaveLength(1);
    expect(getStalk(sections, 'greet', [])).toHaveLength(0);
    expect(getStalk(sections, 'greet', ['alice', 'hi', 'extra'])).toHaveLength(
      0,
    );
  });

  it('matches sections with rest args', () => {
    const sections = [
      makePresheafSection(
        'A',
        { log: M.call(M.string()).rest(M.string()).returns(M.any()) },
        { log: (..._args: string[]) => undefined },
        { cost: 1 },
      ),
    ];

    expect(getStalk(sections, 'log', ['info'])).toHaveLength(1);
    expect(getStalk(sections, 'log', ['info', 'msg'])).toHaveLength(1);
    expect(getStalk(sections, 'log', ['info', 'msg', 'extra'])).toHaveLength(1);
    expect(getStalk(sections, 'log', [])).toHaveLength(0);
    expect(getStalk(sections, 'log', [42])).toHaveLength(0);
  });

  it('returns all sections when all match', () => {
    const sections = [
      makePresheafSection(
        'A',
        { f: M.call(M.string()).returns(M.number()) },
        { f: () => 1 },
        { cost: 1 },
      ),
      makePresheafSection(
        'B',
        { f: M.call(M.string()).returns(M.number()) },
        { f: () => 2 },
        { cost: 2 },
      ),
      makePresheafSection(
        'C',
        { f: M.call(M.string()).returns(M.number()) },
        { f: () => 3 },
        { cost: 3 },
      ),
    ];

    const stalk = getStalk(sections, 'f', ['hello']);
    expect(stalk).toHaveLength(3);
  });
});
