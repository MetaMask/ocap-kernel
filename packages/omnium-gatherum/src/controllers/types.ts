import type { Methods } from '@endo/exo';
import type { Logger } from '@metamask/logger';

/**
 * Configuration passed to all controllers during initialization.
 */
export type ControllerConfig = {
  logger: Logger;
};

/**
 * Type helper for defining facet interfaces.
 * Extracts a subset of methods from a controller type for POLA attenuation.
 *
 * @example
 * ```typescript
 * type StorageReadFacet = FacetOf<StorageController, 'get' | 'has'>;
 * type StorageWriteFacet = FacetOf<StorageController, 'set' | 'delete'>;
 * ```
 */
export type FacetOf<
  TController extends Methods,
  TMethodNames extends keyof TController,
> = Pick<TController, TMethodNames>;
