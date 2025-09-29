import { execa } from 'execa';
import { describe, expect, it, vi } from 'vitest';

import { filterGitIgnored } from './git-utils.ts';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

describe('create-package/git-utils', () => {
  describe('filterGitIgnored', () => {
    const execaMock = vi.mocked(execa);

    it('filters out files that are ignored by git', async () => {
      // @ts-expect-error - We only need stdout
      execaMock.mockResolvedValueOnce({ stdout: '/file1.txt\n/file2.txt\n' });
      const files = await filterGitIgnored({
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
      const files = await filterGitIgnored({
        '/file1.txt': 'foo',
        '/file2.txt': 'bar',
        '/file3.txt': 'baz',
      });
      expect(files).toStrictEqual({});
    });

    it('returns a structurally equivalent map if no files are ignored by git', async () => {
      // @ts-expect-error - We only need stdout
      execaMock.mockResolvedValueOnce({ stdout: '\n' });
      const getFiles = () => ({
        '/file1.txt': 'foo',
        '/file2.txt': 'bar',
        '/file3.txt': 'baz',
      });
      const files = await filterGitIgnored(getFiles());
      expect(files).toStrictEqual(getFiles());
    });
  });
});
