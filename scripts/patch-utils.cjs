'use strict';

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
 * Get the transitive closure of internal workspace dependencies for a package.
 *
 * @param {string} pkgName - The package name.
 * @param {Set<string>} workspaceNames - Set of all workspace names.
 * @param {(name: string) => string[]} getDeps - Returns dependency names for a workspace.
 * @param {Map<string, Set<string>>} cache - Memoization cache.
 * @returns {Set<string>} Set of transitive internal dep names.
 */
function getTransitiveInternalDeps(pkgName, workspaceNames, getDeps, cache) {
  if (cache.has(pkgName)) {
    return cache.get(pkgName);
  }

  if (!workspaceNames.has(pkgName)) {
    cache.set(pkgName, new Set());
    return new Set();
  }

  const result = new Set();
  cache.set(pkgName, result); // set before recursing to break cycles

  for (const depName of getDeps(pkgName)) {
    if (workspaceNames.has(depName)) {
      result.add(depName);
      for (const transitiveDep of getTransitiveInternalDeps(
        depName,
        workspaceNames,
        getDeps,
        cache,
      )) {
        result.add(transitiveDep);
      }
    }
  }

  return result;
}

module.exports = { parsePatchFilename, getTransitiveInternalDeps };
