/**
 * Stalk computation: filter presheaf sections by guard matching.
 */

import { GET_INTERFACE_GUARD } from '@endo/exo';
import {
  matches,
  getInterfaceGuardPayload,
  getMethodGuardPayload,
} from '@endo/patterns';
import type { InterfaceGuard, MethodGuard } from '@endo/patterns';

import type { MethodGuardPayload } from './guard.ts';
import type { PresheafSection } from './types.ts';

/**
 * Check whether an interface guard covers the invocation point (method, args).
 *
 * @param guard - The interface guard to test.
 * @param method - The method name being invoked.
 * @param args - The arguments to the method invocation.
 * @returns True if the guard accepts the invocation.
 */
export const guardCoversPoint = (
  guard: InterfaceGuard,
  method: string,
  args: unknown[],
): boolean => {
  const { methodGuards } = getInterfaceGuardPayload(guard) as unknown as {
    methodGuards: Record<string, MethodGuard>;
  };
  if (!(method in methodGuards)) {
    return false;
  }
  const methodGuard = methodGuards[method];
  if (!methodGuard) {
    return false;
  }
  const { argGuards, optionalArgGuards, restArgGuard } = getMethodGuardPayload(
    methodGuard,
  ) as unknown as MethodGuardPayload;
  const optionals = optionalArgGuards ?? [];
  const maxFixedArgs = argGuards.length + optionals.length;
  return (
    args.length >= argGuards.length &&
    (restArgGuard !== undefined || args.length <= maxFixedArgs) &&
    args
      .slice(0, argGuards.length)
      .every((arg, i) => matches(arg, argGuards[i])) &&
    args
      .slice(argGuards.length, maxFixedArgs)
      .every((arg, i) => matches(arg, optionals[i])) &&
    (restArgGuard === undefined ||
      args.slice(maxFixedArgs).every((arg) => matches(arg, restArgGuard)))
  );
};

/**
 * Get the stalk at an invocation point.
 *
 * Returns the presheaf sections whose guards accept the given method + args.
 *
 * @param sections - The presheaf sections to filter.
 * @param method - The method name being invoked.
 * @param args - The arguments to the method invocation.
 * @returns The presheaf sections whose guards accept the invocation.
 */
export const getStalk = <MetaData>(
  sections: PresheafSection<MetaData>[],
  method: string,
  args: unknown[],
): PresheafSection<MetaData>[] => {
  return sections.filter(({ exo }) => {
    const interfaceGuard = exo[GET_INTERFACE_GUARD]?.();
    if (!interfaceGuard) {
      return false;
    }
    return guardCoversPoint(interfaceGuard, method, args);
  });
};
