import { define, is, object, string } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import semverValid from 'semver/functions/valid';

/**
 * Unique identifier for a Caplet (any non-empty ASCII string without whitespace).
 */
export type CapletId = string;

/**
 * Validate CapletId format.
 * Requires non-empty ASCII string with no whitespace.
 *
 * @param value - The value to validate.
 * @returns True if valid CapletId format.
 */
export const isCapletId = (value: unknown): value is CapletId =>
  typeof value === 'string' &&
  value.length > 0 &&
  // All ASCII characters except control characters and whitespace.
  // 0x20 is the space character.

  /^[\x21-\x7E]+$/u.test(value);

export const CapletIdStruct = define<CapletId>('CapletId', isCapletId);

/**
 * Semantic version string (e.g., "1.0.0").
 */
export type SemVer = string;

/**
 * Validate SemVer format using the semver package.
 * Requires strict format without 'v' prefix (e.g., "1.0.0" not "v1.0.0").
 *
 * @param value - The value to validate.
 * @returns True if valid SemVer format.
 */
export const isSemVer = (value: unknown): value is SemVer =>
  typeof value === 'string' &&
  // semver.valid() is lenient and strips 'v' prefix, so check that cleaned value equals original
  semverValid(value) === value;

export const SemVerStruct = define<SemVer>('SemVer', isSemVer);

/**
 * Superstruct schema for validating CapletManifest objects.
 */
export const CapletManifestStruct = object({
  id: CapletIdStruct,
  name: string(),
  version: SemVerStruct,
  bundleSpec: string(),
});

/**
 * Metadata that defines a Caplet's identity, dependencies, and capabilities.
 */
export type CapletManifest = Infer<typeof CapletManifestStruct>;

/**
 * Type guard for CapletManifest validation.
 *
 * @param value - The value to validate.
 * @returns True if the value is a valid CapletManifest.
 */
export const isCapletManifest = (value: unknown): value is CapletManifest =>
  is(value, CapletManifestStruct);

/**
 * Assert that a value is a valid CapletManifest.
 *
 * @param value - The value to validate.
 * @throws If the value is not a valid CapletManifest.
 */
export function assertCapletManifest(
  value: unknown,
): asserts value is CapletManifest {
  if (!isCapletManifest(value)) {
    throw new Error('Invalid CapletManifest');
  }
}

/**
 * Record for an installed Caplet.
 * Combines manifest with runtime identifiers.
 */
export type InstalledCaplet = {
  manifest: CapletManifest;
  subclusterId: string;
  rootKref: string;
  installedAt: number;
};

/**
 * Result of installing a Caplet.
 */
export type InstallResult = {
  capletId: CapletId;
  subclusterId: string;
};
