import type { Methods } from '@endo/exo';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';

/**
 * Extract keys from Source that are callable functions.
 * Filters to string | symbol to match RemotableMethodName from @endo/pass-style.
 */
type MethodKeys<Source> = {
  [Key in keyof Source]: Source[Key] extends CallableFunction ? Key : never;
}[keyof Source] &
  (string | symbol);

type BoundMethod<Func> = Func extends CallableFunction
  ? OmitThisParameter<Func>
  : never;

type FacetMethods<Source, MethodNames extends MethodKeys<Source>> = Methods & {
  [Key in MethodNames]: BoundMethod<Source[Key]>;
};

/**
 * Create an attenuated facet of a source object that exposes only specific methods.
 *
 * This enforces POLA (Principle of Least Authority) by allowing Controller A
 * to receive only the methods it needs from Controller B.
 *
 * @param name - Name for the facet (used in debugging/logging).
 * @param source - The source object containing methods.
 * @param methodNames - Array of method names to expose.
 * @returns A hardened facet exo with only the specified methods.
 * @example
 * ```typescript
 * // StorageController exposes full interface internally
 * const storageController = makeStorageController(config);
 *
 * // CapletController only needs get/set, not clear/getAll
 * const storageFacet = makeFacet('CapletStorage', storageController, ['get', 'set']);
 * const capletController = makeCapletController({ storage: storageFacet });
 * ```
 */
export function makeFacet<
  Source extends Record<string, unknown>,
  MethodNames extends MethodKeys<Source>,
>(
  name: string,
  source: Source,
  methodNames: readonly MethodNames[],
): FacetMethods<Source, MethodNames> {
  const methods: Partial<FacetMethods<Source, MethodNames>> = {};

  for (const methodName of methodNames) {
    const method = source[methodName];
    if (typeof method !== 'function') {
      throw new Error(
        `makeFacet: Method '${String(
          methodName,
        )}' not found on source or is not a function`,
      );
    }
    // Bind the method to preserve 'this' context if needed
    methods[methodName] = (method as CallableFunction).bind(
      source,
    ) as BoundMethod<Source[MethodNames]> as FacetMethods<
      Source,
      MethodNames
    >[MethodNames];
  }

  return makeDefaultExo(name, methods as FacetMethods<Source, MethodNames>);
}
harden(makeFacet);
