/**
 * Sheafify a presheaf into an authority manager.
 *
 * `sheafify({ name, sections })` returns a `Sheaf` — an immutable object
 * that produces dispatch sections over a fixed presheaf.
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

import { makeDiscoverableExo } from '../discoverable.ts';
import type { MethodSchema } from '../schema.ts';
import { stringify } from '../stringify.ts';
import { driveLift } from './drive.ts';
import { collectSheafGuard } from './guard.ts';
import type { MethodGuardPayload } from './guard.ts';
import { evaluateMetadata, resolveMetaDataSpec } from './metadata.ts';
import type { ResolvedMetaDataSpec } from './metadata.ts';
import { getStalk } from './stalk.ts';
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

/**
 * Invoke a method on a section exo, throwing if the handler is missing.
 *
 * @param exo - The section exo to invoke.
 * @param method - The method name to call.
 * @param args - The positional arguments.
 * @returns The synchronous return value of the method (typically a Promise).
 */
const invokeExo = (exo: Section, method: string, args: unknown[]): unknown => {
  const obj = exo as Record<string, (...a: unknown[]) => unknown>;
  const fn = obj[method];
  if (fn === undefined) {
    throw new Error(`Section has guard for '${method}' but no handler`);
  }
  return fn.call(obj, ...args);
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
  const buildSection = ({
    guard,
    lift,
    schema,
  }: {
    guard: InterfaceGuard;
    lift: Lift<MetaData>;
    schema?: Record<string, MethodSchema>;
  }): object => {
    const resolvedGuard = guard;

    const asyncMethodGuards = asyncifyMethodGuards(resolvedGuard);
    const asyncGuard =
      schema === undefined
        ? M.interface(`${name}:section`, asyncMethodGuards)
        : M.interface(`${name}:section`, asyncMethodGuards, {
            defaultGuards: 'passable',
          });

    const dispatch = async (
      method: string,
      args: unknown[],
    ): Promise<unknown> => {
      const stalk = getStalk(frozenSections, method, args);
      const evaluatedStalk: EvaluatedSection<MetaData>[] = stalk.map(
        (section) => ({
          exo: section.exo,
          metadata: evaluateMetadata(section.spec, args),
        }),
      );
      switch (evaluatedStalk.length) {
        case 0:
          throw new Error(`No section covers ${method}(${stringify(args, 0)})`);
        case 1:
          return invokeExo(
            (evaluatedStalk[0] as EvaluatedSection<MetaData>).exo,
            method,
            args,
          );
        default: {
          const collapsed = collapseEquivalent(evaluatedStalk);
          if (collapsed.length === 1) {
            return invokeExo(
              (collapsed[0] as EvaluatedSection<MetaData>).exo,
              method,
              args,
            );
          }
          const { constraints, stripped } = decomposeMetadata(collapsed);
          const strippedToCollapsed = new Map(
            stripped.map((strippedGerm, i) => [
              strippedGerm,
              collapsed[i] as EvaluatedSection<MetaData>,
            ]),
          );
          return driveLift(
            lift,
            stripped,
            { method, args, constraints },
            async (germ) => {
              const section = strippedToCollapsed.get(germ);
              if (section === undefined) {
                throw new Error('lift yielded an unknown germ');
              }
              return invokeExo(section.exo, method, args);
            },
          );
        }
      }
    };

    const handlers: Record<string, (...args: unknown[]) => Promise<unknown>> =
      {};
    for (const method of Object.keys(asyncMethodGuards)) {
      handlers[method] = async (...args: unknown[]) => dispatch(method, args);
    }

    const exo = (schema === undefined
      ? makeExo(`${name}:section`, asyncGuard, handlers)
      : makeDiscoverableExo(
          `${name}:section`,
          handlers,
          schema,
          asyncGuard,
        )) as unknown as Section;

    return exo;
  };

  const unionGuard = (): InterfaceGuard =>
    collectSheafGuard(
      name,
      frozenSections.map(({ exo }) => exo),
    );

  const getSection = ({
    guard,
    lift,
  }: {
    guard: InterfaceGuard;
    lift: Lift<MetaData>;
  }): object => buildSection({ guard, lift });

  const getDiscoverableSection = ({
    guard,
    lift,
    schema,
  }: {
    guard: InterfaceGuard;
    lift: Lift<MetaData>;
    schema: Record<string, MethodSchema>;
  }): object => buildSection({ guard, lift, schema });

  const getGlobalSection = ({ lift }: { lift: Lift<MetaData> }): object =>
    buildSection({ guard: unionGuard(), lift });

  const getDiscoverableGlobalSection = ({
    lift,
    schema,
  }: {
    lift: Lift<MetaData>;
    schema: Record<string, MethodSchema>;
  }): object => buildSection({ guard: unionGuard(), lift, schema });

  return {
    getSection,
    getDiscoverableSection,
    getGlobalSection,
    getDiscoverableGlobalSection,
  };
};
