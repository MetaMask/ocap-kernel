import { VatConfigStruct } from '@metamask/ocap-kernel';
import type { ClusterConfig } from '@metamask/ocap-kernel';
import {
  array,
  boolean,
  exactOptional,
  object,
  record,
  string,
  type,
  union,
  literal,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

/**
 * Source type for caplet bundle fetching.
 */
export type CapletSource = 'url' | 'npm';

/**
 * Capability request from a caplet.
 */
export const CapabilityRequestStruct = object({
  name: string(),
  description: string(),
  required: exactOptional(boolean()),
});

export type CapabilityRequest = Infer<typeof CapabilityRequestStruct>;

/**
 * Capability definition provided by a caplet.
 */
export const CapabilityDefinitionStruct = object({
  name: string(),
  description: string(),
  interface: string(), // Interface name or description
});

export type CapabilityDefinition = Infer<typeof CapabilityDefinitionStruct>;

/**
 * UI configuration for a caplet.
 */
export const CapletUIConfigStruct = object({
  entryPoint: string(), // Path to UI component within bundle
  mountPoint: exactOptional(
    union([
      literal('popup'),
      literal('sidebar'),
      literal('modal'),
      literal('custom'),
    ]),
  ),
});

export type CapletUIConfig = Infer<typeof CapletUIConfigStruct>;

/**
 * Registry information for a caplet.
 */
export const CapletRegistryInfoStruct = object({
  source: union([literal('url'), literal('npm')]),
  location: string(), // URL or npm package name
});

export type CapletRegistryInfo = Infer<typeof CapletRegistryInfoStruct>;

/**
 * Caplet manifest structure.
 */
export const CapletManifestStruct = object({
  name: string(),
  version: string(),
  description: exactOptional(string()),
  author: exactOptional(string()),
  bundleSpec: string(), // URL or path to vat bundle(s)
  clusterConfig: object({
    bootstrap: string(),
    forceReset: exactOptional(boolean()),
    services: exactOptional(array(string())),
    vats: record(string(), VatConfigStruct),
  }),
  ui: exactOptional(CapletUIConfigStruct),
  capabilities: exactOptional(
    object({
      requested: array(CapabilityRequestStruct),
      provided: exactOptional(array(CapabilityDefinitionStruct)),
    }),
  ),
  registry: exactOptional(CapletRegistryInfoStruct),
});

export type CapletManifest = Infer<typeof CapletManifestStruct>;

/**
 * Installed caplet metadata stored in extension storage.
 */
export const InstalledCapletStruct = object({
  id: string(), // Unique identifier: `${name}@${version}`
  manifest: CapletManifestStruct,
  subclusterId: exactOptional(string()), // Subcluster ID if launched
  installedAt: string(), // ISO timestamp
  enabled: exactOptional(boolean()),
});

export type InstalledCaplet = Infer<typeof InstalledCapletStruct>;

/**
 * Capability grant stored in extension storage.
 */
export const CapabilityGrantStruct = object({
  capletId: string(),
  capabilityName: string(),
  target: string(), // KRef or service name
  grantedAt: string(), // ISO timestamp
  restrictions: exactOptional(
    object({
      expiresAt: exactOptional(string()), // ISO timestamp
      scope: exactOptional(string()),
    }),
  ),
});

export type CapabilityGrant = Infer<typeof CapabilityGrantStruct>;
