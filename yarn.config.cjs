// This file is used to define, among other configuration, rules that Yarn will
// execute when you run `yarn constraints`. These rules primarily check the
// manifests of each package in the monorepo to ensure they follow a standard
// format, but also check the presence of certain files as well.

/** @type {import('@yarnpkg/types')} */
const { defineConfig } = require('@yarnpkg/types');
const { readFile } = require('fs/promises');
const { get } = require('lodash');
const { basename, resolve } = require('path');
const semver = require('semver');
const { inspect } = require('util');

// Packages that do not have an entrypoint, types, or sideEffects
const entrypointExceptions = ['shims', 'streams'];
// Packages that do not have typedoc
const typedocExceptions = ['test-utils', 'extension'];
// Packages that do not have build or tests
const noBuildOrTests = ['test-utils'];
// Packages that do not export a `package.json` file
const noPackageJson = ['extension'];

/**
 * Aliases for the Yarn type definitions, to make the code more readable.
 *
 * @typedef {import('@yarnpkg/types').Yarn} Yarn
 * @typedef {import('@yarnpkg/types').Yarn.Constraints.Workspace} Workspace
 * @typedef {import('@yarnpkg/types').Yarn.Constraints.Dependency} Dependency
 * @typedef {import('@yarnpkg/types').Yarn.Constraints.DependencyType} DependencyType
 */

module.exports = defineConfig({
  async constraints({ Yarn }) {
    const rootWorkspace = Yarn.workspace({ cwd: '.' });
    if (rootWorkspace === null) {
      throw new Error('Could not find root workspace');
    }

    const repositoryUri = rootWorkspace.manifest.repository.url.replace(
      /\.git$/u,
      '',
    );

    for (const workspace of Yarn.workspaces()) {
      const workspaceBasename = getWorkspaceBasename(workspace);
      const isChildWorkspace = workspace.cwd !== '.';
      const isPrivate = workspace.manifest.private === true;
      const dependenciesByIdentAndType = getDependenciesByIdentAndType(
        Yarn.dependencies({ workspace }),
      );

      // All packages must have a name
      expectWorkspaceField(workspace, 'name');

      if (isChildWorkspace) {
        // All non-root packages must have a name that matches its directory
        expectWorkspaceField(
          workspace,
          'name',
          `@${isPrivate ? 'ocap' : 'metamask'}/${workspaceBasename}`,
        );

        // All non-root packages must have a version.
        expectWorkspaceField(workspace, 'version');

        // // All non-root packages must have a description that does not end with a period.
        expectWorkspaceDescription(workspace);

        if (!isPrivate) {
          // All non-root packages must have the same set of NPM keywords.
          expectWorkspaceField(workspace, 'keywords', ['MetaMask', 'Ethereum']);

          // All non-root packages must have a homepage URL that includes its name.
          expectWorkspaceField(
            workspace,
            'homepage',
            `${repositoryUri}/tree/main/packages/${workspaceBasename}#readme`,
          );

          // All non-root packages must have a URL for reporting bugs that points
          // to the Issues page for the repository.
          expectWorkspaceField(
            workspace,
            'bugs.url',
            `${repositoryUri}/issues`,
          );
        }

        // All non-root packages must specify a Git repository within the
        // MetaMask GitHub organization.
        expectWorkspaceField(workspace, 'repository.type', 'git');
        expectWorkspaceField(
          workspace,
          'repository.url',
          `${repositoryUri}.git`,
        );

        if (isPrivate) {
          // Non-published packages should not have a license.
          workspace.unset('license');
        } else {
          // All published packages must be MIT else they must be private
          expectWorkspaceField(workspace, 'license', 'MIT');
        }

        if (!isPrivate) {
          // The entrypoint for all published packages must be the same.
          expectWorkspaceField(workspace, 'module', './dist/index.mjs');
          expectWorkspaceField(workspace, 'main', './dist/index.cjs');
          // The type definitions entrypoint for all publishable packages must be the same.
          expectWorkspaceField(
            workspace,
            'exports["."].types',
            './dist/types/index.d.cts',
          );

          // The exports for all published packages must be the same.
          // CommonJS
          expectWorkspaceField(
            workspace,
            'exports["."].require.default',
            './dist/index.cjs',
          );
          expectWorkspaceField(
            workspace,
            'exports["."].require.types',
            './dist/index.d.cts',
          );
          // ESM
          expectWorkspaceField(
            workspace,
            'exports["."].import.default',
            './dist/index.mjs',
          );
          expectWorkspaceField(
            workspace,
            'exports["."].import.types',
            './dist/index.d.mts',
          );

          // Published packages must not have side effects.
          expectWorkspaceField(workspace, 'sideEffects', false);

          // All published packages must have the same "publish:preview" script.
          expectWorkspaceField(
            workspace,
            'scripts.publish:preview',
            'yarn npm publish --tag preview',
          );

          // All published packages must not have a "prepack" script.
          expectWorkspaceField(workspace, 'scripts.prepack', null);

          // All non-root package must have valid "changelog:update" and
          // "changelog:validate" scripts.
          expectCorrectWorkspaceChangelogScripts(workspace);
        }

        // Non-published packages must not specify the following keys except from the ones that are exempted
        if (isPrivate && !entrypointExceptions.includes(workspaceBasename)) {
          workspace.unset('module');
          workspace.unset('main');
          workspace.unset('types');
          workspace.unset('sideEffects');
        }

        // All non-root packages must export a `package.json` file except for the ones that are exempted
        if (!noPackageJson.includes(workspaceBasename)) {
          expectWorkspaceField(
            workspace,
            'exports["./package.json"]',
            './package.json',
          );
        }

        if (!isPrivate || entrypointExceptions.includes(workspaceBasename)) {
          // The list of files included in all non-root packages must only include
          // files generated during the build process.
          expectWorkspaceField(workspace, 'files', ['dist/']);
        }

        if (!typedocExceptions.includes(workspaceBasename)) {
          // All non-root packages must have the same "build:docs" script.
          expectWorkspaceField(workspace, 'scripts.build:docs', 'typedoc');
        }

        // All packages except the root must have the same "clean" script.
        expectWorkspaceField(
          workspace,
          'scripts.clean',
          "rimraf --glob ./dist './*.tsbuildinfo'",
        );

        // No non-root packages may have a "prepack" script.
        workspace.unset('scripts.prepack');

        // All non-root packages must have the same "test" script.
        if (!noBuildOrTests.includes(workspaceBasename)) {
          expectWorkspaceField(
            workspace,
            'scripts.test',
            'vitest run --config vitest.config.ts',
          );
          expectWorkspaceField(
            workspace,
            'scripts.test',
            'vitest run --config vitest.config.ts',
          );
          expectWorkspaceField(
            workspace,
            'scripts.test:clean',
            'yarn test --no-cache --coverage.clean',
          );
          expectWorkspaceField(
            workspace,
            'scripts.test:dev',
            'yarn test --coverage false',
          );
          expectWorkspaceField(
            workspace,
            'scripts.test:verbose',
            'yarn test --reporter verbose',
          );
          expectWorkspaceField(
            workspace,
            'scripts.test:watch',
            'vitest --config vitest.config.ts',
          );
        }
      }

      // Add all packages must have the same "build" script
      if (!noBuildOrTests.includes(workspaceBasename)) {
        expectWorkspaceField(workspace, 'scripts.build');
      }

      if (!isChildWorkspace) {
        // The root package must not specify exports.
        workspace.unset('exports');

        // The root package must specify an empty set of published files. (This
        // is required in order to be able to import anything in
        // development-only scripts, as otherwise the
        // `node/no-unpublished-require` ESLint rule will disallow it.)
        expectWorkspaceField(workspace, 'files', []);
      }

      // Ensure all dependency ranges are recognizable
      expectValidVersionRanges(Yarn, workspace);

      // Ensure dependency ranges are synchronized across the monorepo
      expectSynchronizedRanges(Yarn, workspace);

      // Ensure dependencies are not duplicated across dependency types
      expectUniqueDependencyTypes(Yarn, workspace);

      // If one workspace package lists another workspace package within
      // `peerDependencies`, the dependency range must satisfy the current
      // version of that package.
      expectUpToDateWorkspacePeerDependencies(Yarn, workspace);

      // No dependency may be listed under both `dependencies` and
      // `devDependencies`.
      expectDependenciesNotInBothProdAndDev(
        workspace,
        dependenciesByIdentAndType,
      );

      // If one workspace package (A) lists another workspace package (B) in its
      // `dependencies`, and B is a controller package, then we need to ensure
      // that B is also listed in A's `peerDependencies` and that the version
      // range satisfies the current version of B.
      expectControllerDependenciesListedAsPeerDependencies(
        Yarn,
        workspace,
        dependenciesByIdentAndType,
      );

      // The root workspace (and only the root workspace) must specify the Yarn
      // version required for development.
      if (isChildWorkspace) {
        workspace.unset('packageManager');
      } else {
        expectWorkspaceField(workspace, 'packageManager', 'yarn@4.2.2');
      }

      // All packages must specify a minimum Node.js version of 18.18.
      expectWorkspaceField(workspace, 'engines.node', '^18.18 || >=20');

      // All non-root public packages should be published to the NPM registry;
      // all non-root private packages should not.
      if (isPrivate) {
        workspace.unset('publishConfig');
      } else {
        expectWorkspaceField(workspace, 'publishConfig.access', 'public');
        expectWorkspaceField(
          workspace,
          'publishConfig.registry',
          'https://registry.npmjs.org/',
        );
      }

      if (!isPrivate) {
        // All non-root packages must have a valid README.md file.
        await expectReadme(workspace, workspaceBasename);
      }
    }

    // All version ranges in `dependencies` and `devDependencies` for the same
    // dependency across the monorepo must be the same.
    expectConsistentDependenciesAndDevDependencies(Yarn);
  },
});

/**
 * Construct a nested map of dependencies. The inner layer categorizes
 * instances of the same dependency by its location in the manifest; the outer
 * layer categorizes the inner layer by the name of the dependency.
 *
 * @param {Dependency[]} dependencies - The list of dependencies to transform.
 * @returns {Map<string, Map<DependencyType, Dependency>>} The resulting map.
 */
function getDependenciesByIdentAndType(dependencies) {
  const dependenciesByIdentAndType = new Map();

  for (const dependency of dependencies) {
    const dependenciesForIdent = dependenciesByIdentAndType.get(
      dependency.ident,
    );

    if (dependenciesForIdent === undefined) {
      dependenciesByIdentAndType.set(
        dependency.ident,
        new Map([[dependency.type, dependency]]),
      );
    } else {
      dependenciesForIdent.set(dependency.type, dependency);
    }
  }

  return dependenciesByIdentAndType;
}

/**
 * Construct a nested map of non-peer dependencies (`dependencies` and
 * `devDependencies`). The inner layer categorizes instances of the same
 * dependency by the version range specified; the outer layer categorizes the
 * inner layer by the name of the dependency itself.
 *
 * @param {Dependency[]} dependencies - The list of dependencies to transform.
 * @returns {Map<string, Map<string, Dependency[]>>} The resulting map.
 */
function getNonPeerDependenciesByIdent(dependencies) {
  const nonPeerDependenciesByIdent = new Map();

  for (const dependency of dependencies) {
    if (dependency.type === 'peerDependencies') {
      continue;
    }

    const dependencyRangesForIdent = nonPeerDependenciesByIdent.get(
      dependency.ident,
    );

    if (dependencyRangesForIdent === undefined) {
      nonPeerDependenciesByIdent.set(
        dependency.ident,
        new Map([[dependency.range, [dependency]]]),
      );
    } else {
      const dependenciesForDependencyRange = dependencyRangesForIdent.get(
        dependency.range,
      );

      if (dependenciesForDependencyRange === undefined) {
        dependencyRangesForIdent.set(dependency.range, [dependency]);
      } else {
        dependenciesForDependencyRange.push(dependency);
      }
    }
  }

  return nonPeerDependenciesByIdent;
}

/**
 * Get the basename of the workspace's directory. The workspace directory is
 * expected to be in the form `<directory>/<package-name>`, and this function
 * will extract `<package-name>`.
 *
 * @param {Workspace} workspace - The workspace.
 * @returns {string} The name of the workspace.
 */
function getWorkspaceBasename(workspace) {
  return basename(workspace.cwd);
}

/**
 * Get the absolute path to a file within the workspace.
 *
 * @param {Workspace} workspace - The workspace.
 * @param {string} path - The path to the file, relative to the workspace root.
 * @returns {string} The absolute path to the file.
 */
function getWorkspacePath(workspace, path) {
  return resolve(__dirname, workspace.cwd, path);
}

/**
 * Get the contents of a file within the workspace. The file is expected to be
 * encoded as UTF-8.
 *
 * @param {Workspace} workspace - The workspace.
 * @param {string} path - The path to the file, relative to the workspace root.
 * @returns {Promise<string>} The contents of the file.
 */
async function getWorkspaceFile(workspace, path) {
  return await readFile(getWorkspacePath(workspace, path), 'utf8');
}

/**
 * Expect that the workspace has the given field, and that it is a non-null
 * value. If the field is not present, or is null, this will log an error, and
 * cause the constraint to fail.
 *
 * If a value is provided, this will also verify that the field is equal to the
 * given value.
 *
 * @param {Workspace} workspace - The workspace to check.
 * @param {string} fieldName - The field to check.
 * @param {unknown} [expectedValue] - The value to check.
 */
function expectWorkspaceField(workspace, fieldName, expectedValue = undefined) {
  const fieldValue = get(workspace.manifest, fieldName);

  if (expectedValue) {
    workspace.set(fieldName, expectedValue);
  } else if (fieldValue === undefined || fieldValue === null) {
    workspace.error(`Missing required field "${fieldName}".`);
  }
}

/**
 * Expect that the workspace has a description, and that it is a non-empty
 * string. If the description is not present, or is null, this will log an
 * error, and cause the constraint to fail.
 *
 * This will also verify that the description does not end with a period.
 *
 * @param {Workspace} workspace - The workspace to check.
 */
function expectWorkspaceDescription(workspace) {
  expectWorkspaceField(workspace, 'description');

  const { description } = workspace.manifest;

  if (typeof description !== 'string') {
    workspace.error(
      `Expected description to be a string, but got ${typeof description}.`,
    );
    return;
  }

  if (description === '') {
    workspace.error(`Expected description not to be an empty string.`);
    return;
  }

  if (description.endsWith('.')) {
    workspace.set('description', description.slice(0, -1));
  }
}

/**
 * Expect that the workspace has "changelog:update" and "changelog:validate"
 * scripts, and that these package scripts call a common script by passing the
 * name of the package as the first argument.
 *
 * @param {Workspace} workspace - The workspace to check.
 */
function expectCorrectWorkspaceChangelogScripts(workspace) {
  const scripts = ['update', 'validate'].reduce((obj, variant) => {
    const expectedStartString = `../../scripts/${variant}-changelog.sh ${workspace.manifest.name}`;
    const script = workspace.manifest.scripts[`changelog:${variant}`] ?? '';
    const match = script.match(new RegExp(`^${expectedStartString}(.*)$`, 'u'));
    return { ...obj, [variant]: { expectedStartString, script, match } };
  }, {});

  if (
    scripts.update.match &&
    scripts.validate.match &&
    scripts.update.match[1] !== scripts.validate.match[1]
  ) {
    workspace.error(
      'Expected package\'s "changelog:validate" and "changelog:update" scripts to pass the same arguments to their underlying scripts',
    );
  }

  for (const [
    variant,
    { expectedStartString, script, match },
  ] of Object.entries(scripts)) {
    expectWorkspaceField(workspace, `scripts.changelog:${variant}`);

    if (script !== '' && !match) {
      workspace.error(
        `Expected package's "changelog:${variant}" script to be or start with "${expectedStartString}", but it was "${script}".`,
      );
    }
  }
}

/**
 * Expect that if the workspace package lists another workspace package within
 * `peerDependencies`, the dependency range satisfies the current version of
 * that package.
 *
 * @param {Yarn} Yarn - The Yarn "global".
 * @param {Workspace} workspace - The workspace to check.
 */
function expectUpToDateWorkspacePeerDependencies(Yarn, workspace) {
  for (const dependency of Yarn.dependencies({ workspace })) {
    const dependencyWorkspace = Yarn.workspace({ ident: dependency.ident });

    if (
      dependencyWorkspace !== null &&
      dependency.type === 'peerDependencies'
    ) {
      const dependencyWorkspaceVersion = new semver.SemVer(
        dependencyWorkspace.manifest.version,
      );
      if (
        !semver.satisfies(
          dependencyWorkspace.manifest.version,
          dependency.range,
        )
      ) {
        expectWorkspaceField(
          workspace,
          `peerDependencies["${dependency.ident}"]`,
          `^${dependencyWorkspaceVersion.major}.0.0`,
        );
      }
    }
  }
}

/**
 * Expect that a workspace package does not list a dependency in both
 * `dependencies` and `devDependencies`.
 *
 * @param {Workspace} workspace - The workspace to check.
 * @param {Map<string, Dependency>} dependenciesByIdentAndType - Map of
 * dependency ident to dependency type and dependency.
 */
function expectDependenciesNotInBothProdAndDev(
  workspace,
  dependenciesByIdentAndType,
) {
  for (const [
    dependencyIdent,
    dependencyInstancesByType,
  ] of dependenciesByIdentAndType.entries()) {
    if (
      dependencyInstancesByType.size > 1 &&
      !dependencyInstancesByType.has('peerDependencies')
    ) {
      workspace.error(
        `\`${dependencyIdent}\` cannot be listed in both \`dependencies\` and \`devDependencies\``,
      );
    }
  }
}

/**
 * Expect that if the workspace package lists another workspace package in its
 * dependencies, and it is a controller package, that the controller package is
 * listed in the workspace's `peerDependencies` and the version range satisfies
 * the current version of the controller package.
 *
 * The expectation in this case is that the client will instantiate B in order
 * to pass it into A. Therefore, it needs to list not only A as a dependency,
 * but also B. Additionally, the version of B that the client is using with A
 * needs to match the version that A itself is expecting internally.
 *
 * Note that this constraint does not apply for packages that seem to represent
 * instantiable controllers but actually represent abstract classes.
 *
 * @param {Yarn} Yarn - The Yarn "global".
 * @param {Workspace} workspace - The workspace to check.
 * @param {Map<string, Dependency>} dependenciesByIdentAndType - Map of
 * dependency ident to dependency type and dependency.
 */
function expectControllerDependenciesListedAsPeerDependencies(
  Yarn,
  workspace,
  dependenciesByIdentAndType,
) {
  for (const [
    dependencyIdent,
    dependencyInstancesByType,
  ] of dependenciesByIdentAndType.entries()) {
    if (!dependencyInstancesByType.has('dependencies')) {
      continue;
    }

    const dependencyWorkspace = Yarn.workspace({ ident: dependencyIdent });

    if (
      dependencyWorkspace !== null &&
      dependencyIdent.endsWith('-controller') &&
      dependencyIdent !== '@metamask/base-controller' &&
      dependencyIdent !== '@metamask/polling-controller' &&
      !dependencyInstancesByType.has('peerDependencies')
    ) {
      const dependencyWorkspaceVersion = new semver.SemVer(
        dependencyWorkspace.manifest.version,
      );
      expectWorkspaceField(
        workspace,
        `peerDependencies["${dependencyIdent}"]`,
        `^${dependencyWorkspaceVersion.major}.0.0`,
      );
    }
  }
}

/**
 * Ensure that the version ranges in the dependencies are valid.
 *
 * @param {Yarn} Yarn - The Yarn "global".
 * @param {Workspace} workspace - The workspace to check.
 */
function expectValidVersionRanges(Yarn, workspace) {
  const isValidVersionRange = (range) => {
    return (
      semver.validRange(range) ||
      range === 'workspace:^' ||
      range === 'workspace:~'
    );
  };
  const dependencies = Yarn.dependencies({ workspace });
  dependencies.forEach((dep) => {
    if (!isValidVersionRange(dep.range)) {
      throw new Error(
        `Invalid version range for dependency ${dep.ident} in ${workspace.cwd}`,
      );
    }
  });
}

/**
 * Parse a version range into its components (modifier, major, minor, patch).
 * Strips the modifier (^ or ~) from the version and returns the parts.
 *
 * @param {string} versionRange - The version range to parse.
 * @returns {object} The parsed components: modifier, major, minor, and patch.
 */
function parseVersion(versionRange) {
  const [modifier, version] =
    versionRange.startsWith('^') || versionRange.startsWith('~')
      ? [versionRange[0], versionRange.slice(1)]
      : ['', versionRange];

  const [major, minor, patch] = version.split('.').map(Number);
  if ([major, minor, patch].some(isNaN)) {
    throw new Error(`Invalid version range: ${versionRange}`);
  }

  return { modifier, major, minor, patch };
}

/**
 * Compare two version ranges and determine if they are out of sync.
 * Compares only if the modifiers ("^", "~") are the same.
 *
 * @param {string} range1 - First version range.
 * @param {string} range2 - Second version range.
 * @returns {boolean} True if range1 is greater than range2.
 */
function versionRangeCompare(range1, range2) {
  const parsed1 = parseVersion(range1);
  const parsed2 = parseVersion(range2);

  // Only compare if modifiers are the same
  if (parsed1.modifier !== parsed2.modifier) {
    return false;
  }

  // Compare major, minor, patch versions
  return (
    parsed1.major > parsed2.major ||
    (parsed1.major === parsed2.major && parsed1.minor > parsed2.minor) ||
    (parsed1.major === parsed2.major &&
      parsed1.minor === parsed2.minor &&
      parsed1.patch > parsed2.patch)
  );
}

/**
 * Ensures all dependency ranges for a package are synchronized across the monorepo.
 * The least version range wins, and inconsistencies throw an error.
 *
 * @param {Yarn} Yarn - The Yarn "global".
 * @param {Workspace} workspace - The current workspace.
 */
function expectSynchronizedRanges(Yarn, workspace) {
  const dependencies = Yarn.dependencies({ workspace });

  dependencies.forEach((dep) => {
    const matchingDeps = Yarn.workspaces()
      .flatMap((ws) => Yarn.dependencies({ workspace: ws }))
      .filter((otherDep) => otherDep.ident === dep.ident);

    matchingDeps.forEach((otherDep) => {
      if (
        dep.range !== otherDep.range &&
        versionRangeCompare(dep.range, otherDep.range)
      ) {
        throw new Error(
          `Dependency ${dep.ident} version out of sync between ${workspace.cwd} and another workspace. Expected ${otherDep.range}, got ${dep.range}.`,
        );
      }
    });
  });
}

/**
 * Ensure that the dependency types are unique for a workspace.
 *
 * @param {Yarn} Yarn - The Yarn "global".
 * @param {Workspace} workspace - The workspace to check.
 */
function expectUniqueDependencyTypes(Yarn, workspace) {
  const dependencies = Yarn.dependencies({ workspace });
  const depMap = new Map();

  dependencies.forEach((dep) => {
    if (depMap.has(dep.ident)) {
      const existingType = depMap.get(dep.ident);
      if (existingType !== dep.type) {
        throw new Error(
          `Dependency ${dep.ident} is listed under both ${existingType} and ${dep.type} in ${workspace.cwd}`,
        );
      }
    } else {
      depMap.set(dep.ident, dep.type);
    }
  });
}

/**
 * Ensure all version ranges for a dependency across the monorepo are the same.
 * Leaves conflict resolution to the user. `peerDependencies` are handled separately.
 *
 * @param {Yarn} Yarn - The Yarn "global".
 */
function expectConsistentDependenciesAndDevDependencies(Yarn) {
  const nonPeerDependenciesByIdent = getNonPeerDependenciesByIdent(
    Yarn.dependencies(),
  );

  for (const [
    dependencyIdent,
    dependenciesByRange,
  ] of nonPeerDependenciesByIdent.entries()) {
    const dependencyRanges = [...dependenciesByRange.keys()].sort();
    if (dependenciesByRange.size > 1) {
      for (const dependencies of dependenciesByRange.values()) {
        for (const dependency of dependencies) {
          dependency.error(
            `Expected version range for ${dependencyIdent} (in ${
              dependency.type
            }) to be consistent across monorepo. Pick one: ${inspect(
              dependencyRanges,
            )}`,
          );
        }
      }
    }
  }
}

/**
 * Expect that the workspace has a README.md file, and that it is a non-empty
 * string. The README.md is expected to:
 *
 * - Not contain template instructions (unless the workspace is the module
 * template itself).
 * - Match the version of Node.js specified in the `.nvmrc` file.
 *
 * @param {Workspace} workspace - The workspace to check.
 * @param {string} workspaceBasename - The name of the workspace.
 * @returns {Promise<void>}
 */
async function expectReadme(workspace, workspaceBasename) {
  const readme = await getWorkspaceFile(workspace, 'README.md');

  if (
    workspaceBasename !== 'metamask-module-template' &&
    readme.includes('## Template Instructions')
  ) {
    workspace.error(
      'The README.md contains template instructions. These instructions should be removed.',
    );
  }

  if (!readme.includes(`yarn add @metamask/${workspaceBasename}`)) {
    workspace.error(
      `The README.md does not contain an example of how to install the package using Yarn (\`yarn add @metamask/${workspaceBasename}\`). Please add an example.`,
    );
  }

  if (!readme.includes(`npm install @metamask/${workspaceBasename}`)) {
    workspace.error(
      `The README.md does not contain an example of how to install the package using npm (\`npm install @metamask/${workspaceBasename}\`). Please add an example.`,
    );
  }
}
