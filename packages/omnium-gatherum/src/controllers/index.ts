// Base types
export type { ControllerConfig, FacetOf } from './types.ts';
export { makeFacet } from './facet.ts';

// Storage
export type {
  NamespacedStorage,
  StorageAdapter,
  ControllerStorage,
  ControllerStorageConfig,
} from './storage/index.ts';
export {
  makeChromeStorageAdapter,
  makeNamespacedStorage,
  makeControllerStorage,
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
  CapletControllerMethods,
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
  makeCapletController,
} from './caplet/index.ts';
