import { dirname, join } from 'path';
import { describe, it, expect, vi } from 'vitest';

import { cp, fileExists, isDirectory } from './file.ts';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  lstat: vi.fn(),
  copyFile: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  access: mocks.access,
  lstat: mocks.lstat,
  copyFile: mocks.copyFile,
}));

const makeTestError = (code?: string): Error & { code?: string } => {
  const error = new Error('test error') as Error & { code?: string };
  if (code) {
    error.code = code;
  }
  return error;
};

describe('file', () => {
  describe('isDirectory', () => {
    it('should return true if the path is a directory', async () => {
      mocks.lstat.mockResolvedValue({ isDirectory: () => true });
      const path = dirname(import.meta.url);
      const result = await isDirectory(path);
      expect(result).toBe(true);
    });

    it('should return false if the path is not a directory', async () => {
      mocks.lstat.mockResolvedValue({ isDirectory: () => false });
      const path = join(dirname(import.meta.url), 'file.ts');
      const result = await isDirectory(path);
      expect(result).toBe(false);
    });

    it('should return false if lstat throws an error with code ENOENT', async () => {
      mocks.lstat.mockRejectedValue(makeTestError('ENOENT'));
      const result = await isDirectory('test');
      expect(result).toBe(false);
    });

    it('should throw an error if lstat throws an error with unknown code', async () => {
      const error = makeTestError('UNKNOWN');
      mocks.lstat.mockRejectedValue(error);
      await expect(isDirectory('test')).rejects.toThrow(error);
      expect(mocks.lstat).toHaveBeenCalledOnce();
    });

    it('should throw an error if lstat throws an error with no code', async () => {
      const error = makeTestError();
      mocks.lstat.mockRejectedValue(error);
      await expect(isDirectory('test')).rejects.toThrow(error);
      expect(mocks.lstat).toHaveBeenCalledOnce();
    });
  });

  describe('cp', () => {
    it('should copy a file', async () => {
      mocks.lstat.mockResolvedValue({ isDirectory: () => false });
      mocks.copyFile.mockResolvedValue(undefined);
      await cp('source', 'destination');
      expect(mocks.copyFile).toHaveBeenCalledOnce();
    });

    it('should throw an error if the source is a directory', async () => {
      mocks.lstat.mockResolvedValue({ isDirectory: () => true });
      await expect(cp('source', 'destination')).rejects.toThrow(
        /not implemented/u,
      );
    });
  });

  describe('fileExists', () => {
    it('should return true if the file can be accessed', async () => {
      mocks.access.mockResolvedValue(undefined);
      const result = await fileExists('source');
      expect(result).toBe(true);
    });

    it('should return true if access throws an error with code EEXIST', async () => {
      mocks.access.mockRejectedValue(makeTestError('EEXIST'));
      const result = await fileExists('source');
      expect(result).toBe(true);
    });

    it('should return false if access throws an error with code ENOENT', async () => {
      mocks.access.mockRejectedValue(makeTestError('ENOENT'));
      const result = await fileExists('source');
      expect(result).toBe(false);
    });

    it('should throw an error if access throws an error with unknown code', async () => {
      const error = makeTestError('UNKNOWN');
      mocks.access.mockRejectedValue(error);
      await expect(fileExists('source')).rejects.toThrow(error);
      expect(mocks.access).toHaveBeenCalledOnce();
    });

    it('should throw an error if access throws an error with no code', async () => {
      const error = makeTestError();
      mocks.access.mockRejectedValue(error);
      await expect(fileExists('source')).rejects.toThrow(error);
      expect(mocks.access).toHaveBeenCalledOnce();
    });
  });
});
