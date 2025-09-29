import { createSandbox, writeFile, readFile } from '@metamask/utils/node';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { readAllFiles, writeFiles } from './fs-utils.ts';
import { excludeGitIgnored } from './git-utils.ts';

const { withinSandbox } = createSandbox('create-package/fs-utils');

vi.mock('./git-utils.ts', () => ({
  excludeGitIgnored: vi.fn((absoluteFileMap) => absoluteFileMap),
}));

describe('create-package/fs-utils', () => {
  const excludeGitIgnoredMock = vi.mocked(excludeGitIgnored);

  describe('readAllFiles', () => {
    it('reads all files and sub-directories in the specified directory', async () => {
      expect.assertions(1);

      await withinSandbox(async (sandbox) => {
        const dirPath = path.join(sandbox.directoryPath, 'dir/');
        await Promise.all(
          (
            [
              ['file1.txt', 'foo'],
              ['file2.txt', 'bar'],
              ['file3.txt', 'baz'],
              ['subdir1/file4.txt', 'qux'],
            ] as const
          ).map(async ([filePath, content]) => {
            await writeFile(path.join(dirPath, filePath), content);
          }),
        );

        const files = await readAllFiles(dirPath);

        expect(files).toStrictEqual({
          'file1.txt': 'foo',
          'file2.txt': 'bar',
          'file3.txt': 'baz',
          'subdir1/file4.txt': 'qux',
        });
      });
    });

    it('reads all files and sub-directories in the specified directory (deeply nested)', async () => {
      expect.assertions(1);

      await withinSandbox(async (sandbox) => {
        const dirPath = path.join(sandbox.directoryPath, 'dir/');
        await Promise.all(
          (
            [
              ['file1.txt', 'foo'],
              ['file2.txt', 'bar'],
              ['file3.txt', 'baz'],
              ['subdir1/file4.txt', 'qux'],
              ['subdir1/subdir2/subdir3/file5.txt', 'quux'],
            ] as const
          ).map(async ([filePath, content]) => {
            await writeFile(path.join(dirPath, filePath), content);
          }),
        );

        const files = await readAllFiles(dirPath);

        expect(files).toStrictEqual({
          'file1.txt': 'foo',
          'file2.txt': 'bar',
          'file3.txt': 'baz',
          'subdir1/file4.txt': 'qux',
          'subdir1/subdir2/subdir3/file5.txt': 'quux',
        });
      });
    });

    it('ignores file system entities that are neither files nor directories', async () => {
      expect.assertions(1);

      await withinSandbox(async (sandbox) => {
        const dirPath = path.join(sandbox.directoryPath, 'dir/');
        await writeFile(path.join(dirPath, 'file1.txt'), 'foo');
        await fs.symlink(
          path.join(dirPath, 'file1.txt'),
          path.join(dirPath, 'file2.txt'),
        );

        const files = await readAllFiles(dirPath);

        expect(files).toStrictEqual({
          'file1.txt': 'foo',
        });
      });
    });

    it('ignores files that are ignored by git', async () => {
      expect.assertions(1);

      await withinSandbox(async (sandbox) => {
        const dirPath = path.join(sandbox.directoryPath, 'dir/');
        await Promise.all(
          (
            [
              ['file1.txt', 'foo'],
              ['file2.txt', 'bar'],
              ['file3.txt', 'baz'],
            ] as const
          ).map(async ([filePath, content]) => {
            await writeFile(path.join(dirPath, filePath), content);
          }),
        );

        excludeGitIgnoredMock.mockResolvedValueOnce({
          [path.join(dirPath, 'file1.txt')]: 'foo',
        });

        const files = await readAllFiles(dirPath);

        expect(files).toStrictEqual({
          'file1.txt': 'foo',
        });
      });
    });
  });

  describe('writeFiles', () => {
    it('writes all files to the specified directory', async () => {
      expect.assertions(4);

      await withinSandbox(async (sandbox) => {
        const dirPath = path.join(sandbox.directoryPath, 'dir/');
        await writeFiles(dirPath, {
          'file1.txt': 'foo',
          'file2.txt': 'bar',
          'file3.txt': 'baz',
          'subdir1/file4.txt': 'qux',
        });

        await Promise.all(
          (
            [
              ['file1.txt', 'foo'],
              ['file2.txt', 'bar'],
              ['file3.txt', 'baz'],
              ['subdir1/file4.txt', 'qux'],
            ] as const
          ).map(async ([filePath, content]) => {
            expect(await readFile(path.join(dirPath, filePath))).toStrictEqual(
              content,
            );
          }),
        );
      });
    });

    it('writes all files to the specified directory (deeply nested)', async () => {
      expect.assertions(5);

      await withinSandbox(async (sandbox) => {
        const dirPath = path.join(sandbox.directoryPath, 'dir/');
        await writeFiles(dirPath, {
          'file1.txt': 'foo',
          'file2.txt': 'bar',
          'file3.txt': 'baz',
          'subdir1/file4.txt': 'qux',
          'subdir1/subdir2/subdir3/file5.txt': 'quux',
        });

        await Promise.all(
          (
            [
              ['file1.txt', 'foo'],
              ['file2.txt', 'bar'],
              ['file3.txt', 'baz'],
              ['subdir1/file4.txt', 'qux'],
              ['subdir1/subdir2/subdir3/file5.txt', 'quux'],
            ] as const
          ).map(async ([filePath, content]) => {
            expect(await readFile(path.join(dirPath, filePath))).toStrictEqual(
              content,
            );
          }),
        );
      });
    });
  });
});
