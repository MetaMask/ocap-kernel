import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CapletManifest } from '../../src/controllers/caplet/types.js';

/**
 * Helper to get the absolute path to the vats directory.
 */
const VATS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../src/vats',
);

/**
 * Helper function to create a file:// URL for a bundle in the vats directory.
 *
 * @param bundleName - Name of the bundle file (e.g., 'echo-caplet.bundle')
 * @returns file:// URL string
 */
function getBundleSpec(bundleName: string): string {
  return new URL(bundleName, `file://${VATS_DIR}/`).toString();
}

/**
 * Manifest for the echo-caplet test fixture.
 *
 * This Caplet provides a simple "echo" service that returns
 * the input message with an "Echo: " prefix.
 *
 * Usage:
 * - Provides: "echo" service
 * - Requests: No services (standalone)
 */
export const echoCapletManifest: CapletManifest = {
  id: 'com.example.echo',
  name: 'Echo Caplet',
  version: '1.0.0',
  bundleSpec: getBundleSpec('echo-caplet.bundle'),
};
