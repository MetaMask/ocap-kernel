import type { CapletManifest } from './controllers/caplet/types.ts';

/**
 * Get the extension URL for a bundle file.
 *
 * @param bundleName - Name of the bundle file (e.g., 'echo-caplet.bundle')
 * @returns chrome-extension:// URL string
 */
function getBundleUrl(bundleName: string): string {
  return chrome.runtime.getURL(bundleName);
}

/**
 * Manifest for the echo-caplet.
 *
 * This Caplet provides a simple "echo" service that returns
 * the input message with an "Echo: " prefix.
 *
 * Usage:
 * - Provides: "echo" service
 * - Requests: No services (standalone)
 */
export const echoCapletManifest: CapletManifest = harden({
  id: 'com.example.echo',
  name: 'Echo Service',
  version: '1.0.0',
  bundleSpec: getBundleUrl('echo-caplet.bundle'),
  requestedServices: [],
  providedServices: ['echo'],
});

/**
 * All available caplet manifests for use in the console.
 */
export const manifests = harden({
  echo: echoCapletManifest,
});
