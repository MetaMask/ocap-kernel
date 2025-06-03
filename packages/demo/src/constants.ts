import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');

const DIST = resolve(PACKAGE_ROOT, 'dist');

export const DEFAULT_WORKER_FILE = resolve(DIST, 'vat-worker.mjs');

export const DEMO_ROOT_DIR = resolve(PACKAGE_ROOT, 'demos');
