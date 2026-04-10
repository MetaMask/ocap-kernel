/**
 * Sheafify a presheaf into an authority manager.
 *
 * `sheafify({ name, sections })` returns a `Sheaf` — an immutable object
 * that tracks granted authority and produces revocable dispatch sections.
 *
 * Each dispatch through a granted section:
 *   1. Computes the stalk (getStalk — presheaf sections matching the point)
 *   2. Collapses equivalent germs (same metadata → one representative)
 *   3. Decomposes metadata into constraints + options
 *   4. Invokes the lift on the distinguished options
 *   5. Dispatches to some element of the opted germ
 */

import { makeExo } from '@endo/exo';
import {
  M,
  getInterfaceGuardPayload,
  getMethodGuardPayload,
} from '@endo/patterns';
import type { InterfaceGuard, MethodGuard } from '@endo/patterns';

import { stringify } from '../stringify.ts';
import { collectSheafGuard } from './guard.ts';
import type { MethodGuardPayload } from './guard.ts';
import { evaluateMetadata, resolveMetaDataSpec } from './metadata.ts';
import type { ResolvedMetaDataSpec } from './metadata.ts';
import { getStalk, guardCoversPoint } from './stalk.ts';
import type {
  EvaluatedSection,
  Lift,
  PresheafSection,
  Section,
  Sheaf,
} from './types.ts';

/**
 * Serialize metadata for equivalence-class keying (collapse step).
 *
 * @param metadata - The metadata value to serialize.
 * @returns A string key for equivalence comparison.
 */
const metadataKey = (metadata: Record<string, unknown>): string => {
  const keys = Object.keys(metadata);
  if (keys.length === 0) {
    return 'null';
  }
  const entries = Object.entries(metadata).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return JSON.stringify(entries);
};

/**
 * Collapse stalk entries into equivalence classes (germs) by metadata identity.
 * Returns one representative per class; the choice within a class is arbitrary.
 *
 * @param stalk - The stalk entries to collapse.
 * @returns One representative per equivalence class.
 */
const collapseEquivalent = <MetaData extends Record<string, unknown>>(
  stalk: EvaluatedSection<MetaData>[],
): EvaluatedSection<MetaData>[] => {
  const seen = new Set<string>();
  const representatives: EvaluatedSection<MetaData>[] = [];
  for (const entry of stalk) {
    const key = metadataKey(entry.metadata);
    if (!seen.has(key)) {
      seen.add(key);
      representatives.push(entry);
    }
  }
  return representatives;
};

/**
 * Decompose stalk metadata into constraints (shared by all germs) and
 * stripped germs (carrying only distinguishing keys).
 *
 * @param stalk - The collapsed stalk entries.
 * @returns Constraints and stripped germs.
 */
const decomposeMetadata = <MetaData extends Record<string, unknown>>(
  stalk: EvaluatedSection<MetaData>[],
): {
  constraints: Partial<MetaData>;
  stripped: EvaluatedSection<Partial<MetaData>>[];
} => {
  const constraints: Record<string, unknown> = {};

  const head = stalk[0];
  if (head === undefined) {
    return { constraints: {} as Partial<MetaData>, stripped: [] };
  }
  const first = head.metadata;
  for (const key of Object.keys(first)) {
    const val = first[key];
    const shared = stalk.every((entry) => {
      const meta = entry.metadata;
      return key in meta && meta[key] === val;
    });
    if (shared) {
      constraints[key] = val;
    }
  }

  const stripped = stalk.map((entry) => {
    const remaining: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(entry.metadata)) {
      if (!(key in constraints)) {
        remaining[key] = val;
      }
    }
    return { exo: entry.exo, metadata: remaining as Partial<MetaData> };
  });

  return { constraints: constraints as Partial<MetaData>, stripped };
};

/**
 * Upgrade all method guards to M.callWhen for async dispatch.
 *
 * @param resolvedGuard - The interface guard to upgrade.
 * @returns A record of async method guards.
 */
const asyncifyMethodGuards = (
  resolvedGuard: InterfaceGuard,
): Record<string, MethodGuard> => {
  const { methodGuards: resolvedMethodGuards } = getInterfaceGuardPayload(
    resolvedGuard,
  ) as unknown as { methodGuards: Record<string, MethodGuard> };

  const asyncMethodGuards: Record<string, MethodGuard> = {};
  for (const [methodName, methodGuard] of Object.entries(
    resolvedMethodGuards,
  )) {
    const { argGuards, optionalArgGuards, restArgGuard, returnGuard } =
      getMethodGuardPayload(methodGuard) as unknown as MethodGuardPayload;
    const optionals = optionalArgGuards ?? [];
    const base = M.callWhen(...argGuards);
    if (optionals.length > 0 && restArgGuard !== undefined) {
      asyncMethodGuards[methodName] = base
        .optional(...optionals)
        .rest(restArgGuard)
        .returns(returnGuard);
    } else if (optionals.length > 0) {
      asyncMethodGuards[methodName] = base
        .optional(...optionals)
        .returns(returnGuard);
    } else if (restArgGuard === undefined) {
      asyncMethodGuards[methodName] = base.returns(returnGuard);
    } else {
      asyncMethodGuards[methodName] = base
        .rest(restArgGuard)
        .returns(returnGuard);
    }
  }
  return asyncMethodGuards;
};

type Grant = {
  exo: Section;
  guard: InterfaceGuard;
  revoke: () => void;
  isRevoked: () => boolean;
};

type ResolvedSection<M extends Record<string, unknown>> = {
  exo: Section;
  spec: ResolvedMetaDataSpec<M> | undefined;
};

export const sheafify = <
  MetaData extends Record<string, unknown> = Record<string, unknown>,
>({
  name,
  sections,
  compartment,
}: {
  name: string;
  sections: PresheafSection<MetaData>[];
  compartment?: { evaluate: (src: string) => unknown };
}): Sheaf<MetaData> => {
  const frozenSections: readonly ResolvedSection<MetaData>[] = Object.freeze(
    sections.map((section) => ({
      exo: section.exo,
      spec:
        section.metadata === undefined
          ? undefined
          : resolveMetaDataSpec(section.metadata, compartment),
    })),
  );
  const grants: Grant[] = [];

  const getSection = ({
    guard,
    lift,
  }: {
    guard: InterfaceGuard;
    lift: Lift<MetaData>;
  }): object => {
    const resolvedGuard = guard;

    const asyncMethodGuards = asyncifyMethodGuards(resolvedGuard);
    const asyncGuard = M.interface(`${name}:section`, asyncMethodGuards);

    let revoked = false;

    const dispatch = async (
      method: string,
      args: unknown[],
    ): Promise<unknown> => {
      if (revoked) {
        throw new Error(`Section revoked: ${name}`);
      }

      const stalk = getStalk(frozenSections, method, args);
      const evaluatedStalk: EvaluatedSection<MetaData>[] = stalk.map(
        (section) => ({
          exo: section.exo,
          metadata: evaluateMetadata(section.spec, args),
        }),
      );
      let winner: EvaluatedSection<MetaData>;
      switch (evaluatedStalk.length) {
        case 0:
          throw new Error(`No section covers ${method}(${stringify(args, 0)})`);
        case 1:
          winner = evaluatedStalk[0] as EvaluatedSection<MetaData>;
          break;
        default: {
          const collapsed = collapseEquivalent(evaluatedStalk);
          if (collapsed.length === 1) {
            winner = collapsed[0] as EvaluatedSection<MetaData>;
            break;
          }
          const { constraints, stripped } = decomposeMetadata(collapsed);
          const index = await lift(stripped, { method, args, constraints });
          winner = collapsed[index] as EvaluatedSection<MetaData>;
          break;
        }
      }

      const obj = winner.exo as Record<string, (...a: unknown[]) => unknown>;
      const fn = obj[method];
      if (fn === undefined) {
        throw new Error(`Section has guard for '${method}' but no handler`);
      }
      return fn.call(obj, ...args);
    };

    const handlers: Record<string, (...args: unknown[]) => Promise<unknown>> =
      {};
    for (const method of Object.keys(asyncMethodGuards)) {
      handlers[method] = async (...args: unknown[]) => dispatch(method, args);
    }

    const exo = makeExo(
      `${name}:section`,
      asyncGuard,
      handlers,
    ) as unknown as Section;

    grants.push({
      exo,
      guard: resolvedGuard,
      revoke: () => {
        revoked = true;
      },
      isRevoked: () => revoked,
    });

    return exo;
  };

  const getGlobalSection = ({ lift }: { lift: Lift<MetaData> }): object => {
    return getSection({
      guard: collectSheafGuard(
        name,
        frozenSections.map(({ exo }) => exo),
      ),
      lift,
    });
  };

  const revokePoint = (method: string, ...args: unknown[]): void => {
    for (const grant of grants) {
      if (!grant.isRevoked() && guardCoversPoint(grant.guard, method, args)) {
        grant.revoke();
      }
    }
  };

  const getExported = (): InterfaceGuard | undefined => {
    const activeExos = grants
      .filter((grant) => !grant.isRevoked())
      .map((grant) => grant.exo);
    if (activeExos.length === 0) {
      return undefined;
    }
    return collectSheafGuard(`${name}:exported`, activeExos);
  };

  const revokeAll = (): void => {
    for (const grant of grants) {
      if (!grant.isRevoked()) {
        grant.revoke();
      }
    }
  };

  return {
    getSection,
    getGlobalSection,
    revokePoint,
    getExported,
    revokeAll,
  };
};
