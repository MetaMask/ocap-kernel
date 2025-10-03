import path from 'node:path';

export type Defines = {
  'process.env.RESET_STORAGE': 'true' | 'false';
};

/**
 * Gets the Vite / esbuild defines config object for one of our Vite builds.
 *
 * @see https://vite.dev/config/shared-options.html#define
 * @param isDev - Whether it's a development build.
 * @returns The Vite / esbuild defines.
 */
export function getDefines(isDev: boolean): Defines {
  const rawVars = [
    ['RESET_STORAGE', process.env.RESET_STORAGE ?? (isDev ? 'true' : 'false')],
  ];

  return Object.fromEntries(
    rawVars.map(([key, value]) => [
      `process.env.${key}`,
      JSON.stringify(value),
    ]),
  ) as Defines;
}

/**
 * Generates Vite aliases for workspace packages to enable proper sourcemap handling in development.
 *
 * By default, Vite resolves workspace packages to their `dist` folders, which breaks the
 * sourcemap chain. These aliases force Vite to use the original TypeScript source from the
 * `src` directories instead, ensuring a complete and accurate sourcemap for debugging.
 *
 * A special alias for `@metamask/kernel-ui/styles.css` is included to resolve the
 * built stylesheet correctly from its `dist` folder.
 *
 * @param rootDir - The monorepo root directory.
 * @param deps - The dependencies object from the `package.json` file.
 * @returns An array of Vite alias objects for development mode.
 */
export function getPackageDevAliases(
  rootDir: string,
  deps: Record<string, string> = {},
): { find: string; replacement: string }[] {
  const workspacePackages = Object.keys(deps)
    .filter(
      (name) => name.startsWith('@metamask/') && deps[name] === 'workspace:^',
    )
    .map((pkgName) => ({
      find: pkgName,
      replacement: path.resolve(
        rootDir,
        `packages/${pkgName.replace('@metamask/', '')}/src`,
      ),
    }));

  return [
    // Special alias for kernel-ui styles, which are in dist
    {
      find: '@metamask/kernel-ui/styles.css',
      replacement: path.resolve(rootDir, 'packages/kernel-ui/dist/styles.css'),
    },
    ...workspacePackages,
  ];
}
