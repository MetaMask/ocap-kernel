/**
 * File system utilities that are agnostic of your use case.
 */

import { writeFile } from '@metamask/utils/node';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { excludeGitIgnored } from './git-utils.ts';

/**
 * A map of file paths to file contents.
 */
export type FileMap = Record<string, string>;

/**
 * Recursively reads a directory and returns a map of file paths to file contents.
 * The file paths are relative to the specified directory.
 *
 * @param baseDir - An absolute path to the directory to read files from.
 * @returns A map of file paths to file contents.
 */
export async function readAllFiles(baseDir: string): Promise<FileMap> {
  const readAllFilesRecur = async (dir: string): Promise<FileMap> => {
    const result: FileMap = {};
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const subDirResult = await readAllFilesRecur(fullPath);
        Object.assign(result, subDirResult);
      } else if (entry.isFile()) {
        const content = await fs.readFile(fullPath, 'utf-8');
        result[fullPath] = content;
      }
    }

    return result;
  };

  const absoluteFileMap = await readAllFilesRecur(baseDir);
  const filteredFileMap = await excludeGitIgnored(absoluteFileMap);
  const relativeFileMap = Object.fromEntries(
    Object.entries(filteredFileMap).map(([filePath, content]) => [
      path.relative(baseDir, filePath),
      content,
    ]),
  );
  return relativeFileMap;
}

/**
 * Writes the specified files to disk. Recursively creates directories as needed.
 *
 * @param parentDirectory - The absolute path of the parent directory to write the files to.
 * @param fileMap - A map of file paths to file contents. The file paths must be relative to
 * the parent directory.
 */
export async function writeFiles(
  parentDirectory: string,
  fileMap: FileMap,
): Promise<void> {
  for (const [relativePath, content] of Object.entries(fileMap)) {
    const fullPath = path.join(parentDirectory, relativePath);
    await writeFile(fullPath, content);
  }
}
