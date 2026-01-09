// Base controller
export { Controller } from './base-controller.ts';
export type { ControllerConfig, ControllerMethods, FacetOf } from './types.ts';
export { makeFacet } from './facet.ts';

// Storage
export type {
  NamespacedStorage,
  StorageAdapter,
  ControllerStorageConfig,
} from './storage/index.ts';
export {
  makeChromeStorageAdapter,
  ControllerStorage,
} from './storage/index.ts';

// Caplet
export type {
  CapletId,
  SemVer,
  CapletManifest,
  InstalledCaplet,
  InstallResult,
  LaunchResult,
  CapletControllerState,
  CapletControllerFacet,
  CapletControllerDeps,
} from './caplet/index.ts';
export {
  isCapletId,
  isSemVer,
  isCapletManifest,
  assertCapletManifest,
  CapletIdStruct,
  SemVerStruct,
  CapletManifestStruct,
  CapletController,
} from './caplet/index.ts';
