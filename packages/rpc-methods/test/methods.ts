import { literal, number, string, tuple } from '@metamask/superstruct';

import { mergeRecords } from '../src/utils.ts';
import type { MethodSpec, PartialHandler } from '../src/utils.ts';

export const getHooks = () =>
  ({
    hook1: () => undefined,
    hook2: () => undefined,
    hook3: () => undefined,
  }) as const;

export type Hooks = ReturnType<typeof getHooks>;

export const getMethods = () =>
  ({
    method1: {
      method: 'method1',
      params: tuple([string()]),
      result: literal(null),
    } as MethodSpec<'method1', [string], null>,
    method2: {
      method: 'method2',
      params: tuple([number()]),
      result: number(),
    } as MethodSpec<'method2', [number], number>,
  }) as const;

export const getPartialHandlers = () =>
  ({
    method1: {
      method: 'method1',
      implementation: (hooks, [_value]) => {
        hooks.hook1();
        return null;
      },
      hooks: { hook1: true, hook2: true } as const,
    } as PartialHandler<
      'method1',
      [string],
      null,
      Pick<Hooks, 'hook1' | 'hook2'>
    >,
    method2: {
      method: 'method2',
      implementation: (hooks, [value]) => {
        hooks.hook3();
        return value * 2;
      },
      hooks: { hook3: true } as const,
    } as PartialHandler<'method2', [number], number, Pick<Hooks, 'hook3'>>,
  }) as const;

export const getHandlers = () =>
  mergeRecords(getMethods(), getPartialHandlers());

type MethodNames = keyof ReturnType<typeof getMethods>;

export type Methods = ReturnType<typeof getMethods>[MethodNames];
