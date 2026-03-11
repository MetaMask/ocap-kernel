'use strict';

const {
  readdir,
  readFile,
  mkdir,
  copyFile,
  access,
} = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ROOT_PATCHES_DIR = path.join(ROOT, 'patches');

/**
 * Parse a patch filename to extract the package name and version.
 *
 * @param {string} filename - The patch filename.
 * @returns {{ pkgName: string, version: string }} The parsed package name and version.
 */
function parsePatchFilename(filename) {
  const withoutExt = filename.replace(/\.patch$/u, '');
  const lastPlusIdx = withoutExt.lastIndexOf('+');
  const version = withoutExt.slice(lastPlusIdx + 1);
  const pkgRaw = withoutExt.slice(0, lastPlusIdx);
  const pkgName = pkgRaw.replace(/\+/gu, '/');
  return { pkgName, version };
}

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
 * Get the transitive closure of internal workspace dependencies for a package.
 *
 * @param {string} pkgName - The package name.
 * @param {Map<string, { name: string, deps: Record<string, string> }>} workspaceMap - The workspace name map.
 * @param {Map<string, Set<string>>} cache - Memoization cache.
 * @returns {Set<string>} Set of transitive internal dep names.
 */
function getTransitiveInternalDeps(pkgName, workspaceMap, cache) {
  if (cache.has(pkgName)) {
    return cache.get(pkgName);
  }

  const ws = workspaceMap.get(pkgName);
  if (!ws) {
    cache.set(pkgName, new Set());
    return new Set();
  }

  const result = new Set();
  cache.set(pkgName, result); // set before recursing to break cycles

  for (const depName of Object.keys(ws.deps)) {
    if (workspaceMap.has(depName)) {
      result.add(depName);
      for (const transitiveDep of getTransitiveInternalDeps(
        depName,
        workspaceMap,
        cache,
      )) {
        result.add(transitiveDep);
      }
    }
  }

  return result;
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
 * @param {Map<string, { name: string, deps: Record<string, string> }>} workspaceMap - The workspace name map.
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
  const cache = new Map();

  return directDeps.filter((ws) => {
    const transitiveDeps = getTransitiveInternalDeps(
      ws.name,
      workspaceMap,
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

main().catch(console.error);
