import { GET_INTERFACE_GUARD } from '@endo/exo';
import type { Methods } from '@endo/exo';
import {
  M,
  getInterfaceGuardPayload,
  getMethodGuardPayload,
} from '@endo/patterns';
import type { InterfaceGuard, MethodGuard, Pattern } from '@endo/patterns';

import type { Section } from './types.ts';

export type MethodGuardPayload = {
  argGuards: Pattern[];
  optionalArgGuards?: Pattern[];
  restArgGuard?: Pattern;
  returnGuard: Pattern;
};

/**
 * Assemble a MethodGuard from its components.
 *
 * The @endo/patterns builder API requires a strict chain order:
 * callWhen → optional → rest → returns. All four combinations of
 * optional/rest presence are handled here so callers don't repeat this logic.
 *
 * @param base - Result of M.callWhen(...requiredArgs).
 * @param optionals - Optional positional arg guards (may be empty).
 * @param restGuard - Rest arg guard, or undefined if none.
 * @param returnGuard - Return value guard.
 * @returns The assembled MethodGuard.
 */
export const buildMethodGuard = (
  base: ReturnType<typeof M.callWhen>,
  optionals: Pattern[],
  restGuard: Pattern | undefined,
  returnGuard: Pattern,
): MethodGuard => {
  if (optionals.length > 0 && restGuard !== undefined) {
    return base
      .optional(...optionals)
      .rest(restGuard)
      .returns(returnGuard);
  } else if (optionals.length > 0) {
    return base.optional(...optionals).returns(returnGuard);
  } else if (restGuard === undefined) {
    return base.returns(returnGuard);
  }
  return base.rest(restGuard).returns(returnGuard);
};

/**
 * Naive union of guards via M.or — no pattern canonicalization.
 *
 * @param guards - Guards to union.
 * @returns A single guard representing the union.
 */
const unionGuard = (guards: Pattern[]): Pattern => {
  if (guards.length === 1) {
    const [first] = guards;
    return first;
  }
  return M.or(...guards);
};

/**
 * Compute the union of all section guards — the open set covered by the sheafified facade.
 *
 * For each method name across all sections, collects the arg guards at each
 * position and produces a union via M.or. Sections with fewer args than
 * the maximum contribute to required args; the remainder become optional.
 *
 * @param name - The name for the collected interface guard.
 * @param sections - The sections whose guards are collected.
 * @returns An interface guard covering all sections.
 */
export const collectSheafGuard = <Core extends Methods>(
  name: string,
  sections: Section<Core>[],
): InterfaceGuard => {
  const payloadsByMethod = new Map<string, MethodGuardPayload[]>();

  for (const section of sections) {
    const interfaceGuard = section[GET_INTERFACE_GUARD]?.();
    if (!interfaceGuard) {
      continue;
    }
    const { methodGuards } = getInterfaceGuardPayload(
      interfaceGuard,
    ) as unknown as { methodGuards: Record<string, MethodGuard> };
    for (const [methodName, methodGuard] of Object.entries(methodGuards)) {
      const payload = getMethodGuardPayload(
        methodGuard,
      ) as unknown as MethodGuardPayload;
      if (!payloadsByMethod.has(methodName)) {
        payloadsByMethod.set(methodName, []);
      }
      const existing = payloadsByMethod.get(methodName);
      existing?.push(payload);
    }
  }

  const getGuardAt = (
    payload: MethodGuardPayload,
    idx: number,
  ): Pattern | undefined => {
    if (idx < payload.argGuards.length) {
      return payload.argGuards[idx];
    }
    const optIdx = idx - payload.argGuards.length;
    if (
      payload.optionalArgGuards &&
      optIdx < payload.optionalArgGuards.length
    ) {
      return payload.optionalArgGuards[optIdx];
    }
    return payload.restArgGuard;
  };

  const unionMethodGuards: Record<string, MethodGuard> = {};
  for (const [methodName, payloads] of payloadsByMethod) {
    const minArity = Math.min(
      ...payloads.map((payload) => payload.argGuards.length),
    );
    const maxArity = Math.max(
      ...payloads.map(
        (payload) =>
          payload.argGuards.length + (payload.optionalArgGuards?.length ?? 0),
      ),
    );

    const requiredArgGuards = [];
    for (let idx = 0; idx < minArity; idx++) {
      requiredArgGuards.push(
        unionGuard(payloads.map((payload) => payload.argGuards[idx])),
      );
    }

    const optionalArgGuards = [];
    for (let idx = minArity; idx < maxArity; idx++) {
      const guards = payloads
        .map((payload) => getGuardAt(payload, idx))
        .filter((guard): guard is Pattern => guard !== undefined);
      optionalArgGuards.push(unionGuard(guards));
    }

    const restArgGuards = payloads
      .map((payload) => payload.restArgGuard)
      .filter((restGuard): restGuard is Pattern => restGuard !== undefined);
    const unionRestArgGuard =
      restArgGuards.length > 0 ? unionGuard(restArgGuards) : undefined;

    const returnGuard = unionGuard(
      payloads.map((payload) => payload.returnGuard),
    );

    unionMethodGuards[methodName] = buildMethodGuard(
      M.callWhen(...requiredArgGuards),
      optionalArgGuards,
      unionRestArgGuard,
      returnGuard,
    );
  }

  return M.interface(name, unionMethodGuards);
};
