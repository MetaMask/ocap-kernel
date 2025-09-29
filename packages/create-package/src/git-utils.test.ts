import { execa, ExecaError } from 'execa';
import { describe, expect, it, vi } from 'vitest';

import { excludeGitIgnored } from './git-utils.ts';

vi.mock('execa', async (importOriginal) => ({
  ...(await importOriginal()),
  execa: vi.fn(),
}));

describe('create-package/git-utils', () => {
  describe('excludeGitIgnored', () => {
    const execaMock = vi.mocked(execa);

    it('filters out files that are ignored by git', async () => {
      // @ts-expect-error - We only need stdout
      execaMock.mockResolvedValueOnce({ stdout: '/file1.txt\n/file2.txt\n' });
      const files = await excludeGitIgnored({
        '/file1.txt': 'foo',
        '/file2.txt': 'bar',
        '/file3.txt': 'baz',
      });
      expect(files).toStrictEqual({
        '/file3.txt': 'baz',
      });
    });

    it('returns an empty map if all files are ignored by git', async () => {
      // @ts-expect-error - We only need stdout
      execaMock.mockResolvedValueOnce({
        stdout: '/file1.txt\n/file2.txt\n/file3.txt\n',
      });
      const files = await excludeGitIgnored({
        '/file1.txt': 'foo',
        '/file2.txt': 'bar',
        '/file3.txt': 'baz',
      });
      expect(files).toStrictEqual({});
    });

    it('returns a structurally equivalent map if no files are ignored by git', async () => {
      // @ts-expect-error - We only need stdout
      execaMock.mockResolvedValueOnce({ stdout: '\n' });
      const files = await excludeGitIgnored({
        '/file1.txt': 'foo',
        '/file2.txt': 'bar',
        '/file3.txt': 'baz',
      });
      expect(files).toStrictEqual({
        '/file1.txt': 'foo',
        '/file2.txt': 'bar',
        '/file3.txt': 'baz',
      });
    });

    it('handles "git check-ignore" failing with exit code 1', async () => {
      // @ts-expect-error - Only defining the properties we need
      execaMock.mockResolvedValueOnce({
        failed: true,
        exitCode: 1,
        stdout: '',
      });
      const files = await excludeGitIgnored({
        '/file1.txt': 'foo',
        '/file2.txt': 'bar',
        '/file3.txt': 'baz',
      });
      expect(files).toStrictEqual({
        '/file1.txt': 'foo',
        '/file2.txt': 'bar',
        '/file3.txt': 'baz',
      });
    });

    it('throws if "git check-ignore" fails with an unknown exit code', async () => {
      const error = new ExecaError();
      error.message = 'git check-ignore failed';
      error.exitCode = 2;
      error.stdout = '';
      error.failed = true;

      // @ts-expect-error - This is actually fine
      execaMock.mockResolvedValueOnce(error);
      await expect(
        excludeGitIgnored({
          '/file1.txt': 'foo',
        }),
      ).rejects.toThrow('git check-ignore failed');
    });
  });
});
