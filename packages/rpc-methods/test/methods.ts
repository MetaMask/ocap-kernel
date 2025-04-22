import { literal, number, string, tuple } from '@metamask/superstruct';

import type { Handler, MethodSpec } from '../src/types.ts';

export const getHooks = () =>
  ({
    hook1: () => undefined,
    hook2: () => undefined,
    hook3: () => undefined,
    hook4: (value: string) => value,
  }) as const;

export type Hooks = ReturnType<typeof getHooks>;

export const getMethods = () =>
  ({
    method1: {
      method: 'method1',
      params: tuple([string()]),
      result: literal(null),
    } as MethodSpec<'method1', [string], Promise<null>>,
    method2: {
      method: 'method2',
      params: tuple([number()]),
      result: number(),
    } as MethodSpec<'method2', [number], number>,
    method3: {
      method: 'method3',
      params: tuple([string()]),
    } as MethodSpec<'method3', [string], void>,
  }) as const;

export const getHandlers = () => {
  const methods = getMethods();
  return {
    method1: {
      ...methods.method1,
      hooks: { hook1: true, hook2: true } as const,
      implementation: async (hooks, [_value]) => {
        hooks.hook1();
        return null;
      },
    } as Handler<
      'method1',
      [string],
      Promise<null>,
      Pick<Hooks, 'hook1' | 'hook2'>
    >,
    method2: {
      ...methods.method2,
      hooks: { hook3: true } as const,
      implementation: (hooks, [value]) => {
        hooks.hook3();
        return value * 2;
      },
    } as Handler<'method2', [number], number, Pick<Hooks, 'hook3'>>,
    method3: {
      ...methods.method3,
      hooks: { hook4: true } as const,
      implementation: (hooks, [value]) => {
        hooks.hook4(value);
      },
    } as Handler<'method3', [string], void, Pick<Hooks, 'hook4'>>,
  };
};

type MethodNames = keyof ReturnType<typeof getMethods>;

export type Methods = ReturnType<typeof getMethods>[MethodNames];
