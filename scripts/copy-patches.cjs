'use strict';

const {
  readdir,
  readFile,
  mkdir,
  copyFile,
  access,
} = require('node:fs/promises');
const path = require('node:path');

const {
  parsePatchFilename,
  getTransitiveInternalDeps,
} = require('./patch-utils.cjs');

const ROOT = path.resolve(__dirname, '..');
const ROOT_PATCHES_DIR = path.join(ROOT, 'patches');

/**
 * Check whether a file exists.
 *
 * @param {string} filepath - The file path.
 * @returns {Promise<boolean>} Whether the file exists.
 */
async function fileExists(filepath) {
  try {
    await access(filepath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read all non-private workspaces from packages/*.
 *
 * @returns {Promise<{ name: string, dir: string, deps: Record<string, string>, files: string[] }[]>} The non-private workspaces.
 */
async function getWorkspaces() {
  const packagesDir = path.join(ROOT, 'packages');
  const entries = await readdir(packagesDir);
  const workspaces = [];

  for (const entry of entries) {
    const pkgJsonPath = path.join(packagesDir, entry, 'package.json');
    if (!(await fileExists(pkgJsonPath))) {
      continue;
    }

    const pkg = JSON.parse(await readFile(pkgJsonPath, 'utf8'));
    if (pkg.private === true) {
      continue;
    }

    workspaces.push({
      name: pkg.name,
      dir: path.join(packagesDir, entry),
      deps: { ...(pkg.dependencies ?? {}) },
      files: pkg.files ?? [],
    });
  }

  return workspaces;
}

/**
 * Build a map from workspace name to workspace object.
 *
 * @param {{ name: string, dir: string, deps: Record<string, string>, files: string[] }[]} workspaces - The workspaces to index.
 * @returns {Map<string, { name: string, dir: string, deps: Record<string, string>, files: string[] }>} The workspace name map.
 */
function buildWorkspaceMap(workspaces) {
  const map = new Map();
  for (const ws of workspaces) {
    map.set(ws.name, ws);
  }
  return map;
}

/**
 * Find the sink workspaces for a given patched dependency.
 *
 * Sinks are workspaces in the set of direct dependents (non-private packages
 * that directly depend on the patched dep) that do not transitively depend on
 * any other workspace in that set. Installing a sink always brings along any
 * non-sink, so only sinks need to ship the patch.
 *
 * @param {string} patchedPkgName - The patched package name.
 * @param {{ name: string, dir: string, deps: Record<string, string>, files: string[] }[]} workspaces - All non-private workspaces.
 * @param {Map<string, { name: string, dir: string, deps: Record<string, string>, files: string[] }>} workspaceMap - The workspace name map.
 * @returns {{ name: string, dir: string, deps: Record<string, string>, files: string[] }[]} The sink workspaces.
 */
function findSinks(patchedPkgName, workspaces, workspaceMap) {
  const directDeps = workspaces.filter((ws) =>
    Object.prototype.hasOwnProperty.call(ws.deps, patchedPkgName),
  );

  if (directDeps.length === 0) {
    return [];
  }

  const directDepNames = new Set(directDeps.map((ws) => ws.name));
  const workspaceNames = new Set(workspaceMap.keys());
  /**
   * Get the dependency names for a workspace.
   *
   * @param {string} name - The workspace name.
   * @returns {string[]} The dependency names.
   */
  const getDeps = (name) => Object.keys(workspaceMap.get(name)?.deps ?? {});
  const cache = new Map();

  return directDeps.filter((ws) => {
    const transitiveDeps = getTransitiveInternalDeps(
      ws.name,
      workspaceNames,
      getDeps,
      cache,
    );
    return ![...transitiveDeps].some((dep) => directDepNames.has(dep));
  });
}

/**
 * Copy patch files from the root patches directory to each sink workspace.
 */
async function main() {
  let patchFiles;
  try {
    const entries = await readdir(ROOT_PATCHES_DIR);
    patchFiles = entries.filter((patchFile) => patchFile.endsWith('.patch'));
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      console.log('No patches directory found at root, nothing to do.');
      return;
    }
    throw error;
  }

  if (patchFiles.length === 0) {
    console.log('No patch files found in root patches directory.');
    return;
  }

  const workspaces = await getWorkspaces();
  const workspaceMap = buildWorkspaceMap(workspaces);

  for (const patchFile of patchFiles) {
    const { pkgName } = parsePatchFilename(patchFile);
    console.log(`Processing patch: ${patchFile} (for ${pkgName})`);

    const sinks = findSinks(pkgName, workspaces, workspaceMap);

    if (sinks.length === 0) {
      console.warn(
        `Warning: No sinks found for patched dep "${pkgName}". The patch won't be shipped.`,
      );
      continue;
    }

    for (const sink of sinks) {
      if (!sink.files.includes('patches/')) {
        console.error(
          `Error: Sink package "${sink.name}" must have "patches/" in its "files" field. Add it to ship the patch.`,
        );
        process.exitCode = 1;
        continue;
      }

      const destDir = path.join(sink.dir, 'patches');
      await mkdir(destDir, { recursive: true });

      const srcPath = path.join(ROOT_PATCHES_DIR, patchFile);
      const destPath = path.join(destDir, patchFile);
      await copyFile(srcPath, destPath);
      console.log(`  Copied to ${path.relative(ROOT, destPath)}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
