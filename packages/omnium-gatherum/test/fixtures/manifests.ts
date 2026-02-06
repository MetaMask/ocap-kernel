import path from 'node:path';
import { fileURLToPath } from 'node:url';

import echoManifestJson from '../../src/caplets/echo/manifest.json';
import type { CapletManifest } from '../../src/controllers/caplet/types.js';

/**
 * Helper to get the absolute path to the echo caplet directory.
 */
const ECHO_CAPLET_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../src/caplets/echo',
);

/**
 * Manifest for the echo-caplet test fixture.
 *
 * This imports the actual manifest.json and resolves the bundleSpec
 * to an absolute file:// URL for tests.
 *
 * This Caplet provides a simple "echo" service that returns
 * the input message with an "echo: " prefix.
 *
 * Usage:
 * - Provides: "echo" service
 * - Requests: No services (standalone)
 */
export const echoCapletManifest: CapletManifest = {
  ...echoManifestJson,
  bundleSpec: new URL(
    echoManifestJson.bundleSpec,
    `file://${ECHO_CAPLET_DIR}/`,
  ).toString(),
};
