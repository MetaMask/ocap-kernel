import { exec as execSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

// The imported `execSync` is promisified.
// eslint-disable-next-line n/no-sync
const exec = promisify(execSync);

/**
 * A parsed package.json file.
 */
type PackageJson = {
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
};

/**
 * Finds the latest version from a list of semantic versions.
 *
 * @param versions - Array of version strings to compare.
 * @returns The latest version string.
 * @throws {Error} If no valid versions are provided.
 */
export function latestVersion(versions: string[]): string {
  if (!versions.length) {
    throw new Error('No versions provided');
  }

  return versions.reduce((max, version) => {
    const [maxParts, versionParts] = [max, version].map((str) =>
      str.split('.').map(Number),
    ) as [number[], number[]];

    for (let i = 0; i < Math.max(maxParts.length, versionParts.length); i++) {
      const maxPart = maxParts[i] ?? 0;
      const versionPart = versionParts[i] ?? 0;

      if (versionPart > maxPart) {
        return version;
      }
      if (versionPart < maxPart) {
        return max;
      }
    }

    return versionParts.length > maxParts.length ? version : max;
  });
}

const grepVersions = async (
  dep: string,
  workspaceRoot: string,
): Promise<string[]> => {
  const { stdout } = await exec(`grep -r "${dep}" --include="package.json" .`, {
    cwd: workspaceRoot,
  });
  return (
    stdout
      .match(new RegExp(`"${dep}":\\s*"([^"]+)"`, 'gu'))
      ?.map((match) => match.split('"')[3]) ?? []
  ).filter((version): version is string => version !== undefined);
};

/**
 * Synchronizes dependencies in the package template with the latest versions from the monorepo.
 *
 * @param workspaceRoot - The root directory of the workspace.
 * @param templatePackageJsonPath - The path to the template package.json file.
 * @throws {Error} If the synchronization fails.
 */
export async function syncTemplateDependencies(
  workspaceRoot: string,
  templatePackageJsonPath: string,
): Promise<void> {
  const fullPath = join(workspaceRoot, templatePackageJsonPath);
  const packageJson = JSON.parse(
    await readFile(fullPath, 'utf8'),
  ) as PackageJson;
  const { devDependencies } = packageJson;

  if (devDependencies === undefined) {
    console.warn('No devDependencies found in template package.json');
    return;
  }

  for (const dep of Object.keys(devDependencies)) {
    const versions = await grepVersions(dep, workspaceRoot);

    if (!versions?.length) {
      throw new Error(`No versions found for dependency: ${dep}`);
    }

    devDependencies[dep] = latestVersion(versions);
  }

  // Write the updated package.json back to the file
  await writeFile(fullPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  console.log(`Updated ${templatePackageJsonPath}`);
}
