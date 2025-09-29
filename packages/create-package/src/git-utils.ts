import { execa } from 'execa';

import type { FileMap } from './fs-utils.ts';

/**
 * Filters out files from a {@link FileMap} that are ignored by git.
 *
 * @param absoluteFileMap - A map of absolute file paths to file contents.
 * @returns A map of file paths to file contents.
 */
export async function filterGitIgnored(
  absoluteFileMap: FileMap,
): Promise<FileMap> {
  // See: https://git-scm.com/docs/git-check-ignore
  const checkIgnoreOutput = await execa('git', ['check-ignore', '--stdin'], {
    input: Object.keys(absoluteFileMap).join('\n'),
  });
  const gitIgnoredFiles = new Set(
    checkIgnoreOutput.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  );

  return Object.fromEntries(
    Object.entries(absoluteFileMap).filter(
      ([filePath]) => !gitIgnoredFiles.has(filePath),
    ),
  );
}
