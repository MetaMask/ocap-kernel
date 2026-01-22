import type { Methods } from '@endo/exo';

// Re-export from base-controller for backward compatibility
export type { ControllerConfig, ControllerMethods } from './base-controller.ts';

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
  Controller extends Methods,
  MethodNames extends keyof Controller,
> = Pick<Controller, MethodNames>;
