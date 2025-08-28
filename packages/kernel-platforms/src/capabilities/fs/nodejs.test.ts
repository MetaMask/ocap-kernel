import fs from 'fs/promises';
import type { Dirent } from 'node:fs';
import { resolve } from 'path';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { capabilityFactory } from './nodejs.ts';
import type { FsConfig } from './types.ts';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    readdir: vi.fn(),
  },
  readFile: vi.fn(),
  writeFile: vi.fn(),
  readdir: vi.fn(),
}));

// Mock path
vi.mock('path', () => ({
  resolve: vi.fn(),
}));

describe('fs nodejs capability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock path resolution to return the same path for simplicity
    vi.mocked(resolve).mockImplementation((path) => path.toString());
  });

  describe('capabilityFactory', () => {
    describe.each([
      {
        operation: 'readFile',
        mockFn: fs.readFile,
        validArgs: ['/root/file.txt'],
        mockReturn: 'file content',
        additionalArgs: ['/root/file.txt', { encoding: 'utf8' }],
        additionalMockReturn: Buffer.from('file content'),
      },
      {
        operation: 'writeFile',
        mockFn: fs.writeFile,
        validArgs: ['/root/file.txt', 'content'],
        mockReturn: undefined,
        additionalArgs: ['/root/file.txt', 'content', { encoding: 'utf8' }],
        additionalMockReturn: undefined,
      },
      {
        operation: 'readdir',
        mockFn: fs.readdir,
        validArgs: ['/root/subdir'],
        mockReturn: ['file1.txt', 'file2.txt'] as unknown as Dirent[],
        additionalArgs: ['/root/subdir', { withFileTypes: true }],
        additionalMockReturn: ['file1.txt', 'file2.txt'] as unknown as Dirent[],
      },
    ])(
      '$operation operation',
      ({
        operation,
        mockFn,
        validArgs,
        mockReturn,
        additionalArgs,
        additionalMockReturn,
      }) => {
        type TestCapability = { [operation]: CallableFunction };

        it('works with valid path', async () => {
          vi.mocked(mockFn).mockResolvedValue(mockReturn as never);

          const config: FsConfig = { rootDir: '/root', [operation]: true };
          const capability = capabilityFactory(config) as TestCapability;
          const result = await capability[operation]?.(...validArgs);

          expect(mockFn).toHaveBeenCalledWith(...validArgs);
          expect(result).toBe(mockReturn);
        });

        it('rejects path outside root', async () => {
          const config: FsConfig = { rootDir: '/root', [operation]: true };
          const capability = capabilityFactory(config) as TestCapability;

          // Mock path resolution to simulate path outside root
          vi.mocked(resolve)
            .mockReturnValueOnce(validArgs[0] as string) // For the file path
            .mockReturnValueOnce(validArgs[0] as string) // For the caveat check
            .mockReturnValueOnce('/different-root'); // For the root path

          await expect(capability[operation]?.(...validArgs)).rejects.toThrow(
            'Path /different-root is outside allowed root /root',
          );
          expect(mockFn).not.toHaveBeenCalled();
        });

        it('rejects symlink paths', async () => {
          const config: FsConfig = { rootDir: '/root', [operation]: true };
          const capability = capabilityFactory(config) as TestCapability;

          // Mock path resolution to simulate symlink
          vi.mocked(resolve)
            .mockReturnValueOnce('/resolved/symlink/path') // For the file path
            .mockReturnValueOnce('/resolved/symlink/path') // For the caveat check
            .mockReturnValueOnce('/root'); // For the root path

          await expect(capability[operation]?.(...validArgs)).rejects.toThrow(
            `Symlinks are prohibited: ${validArgs[0]}`,
          );
          expect(mockFn).not.toHaveBeenCalled();
        });

        if (additionalArgs && additionalMockReturn) {
          it('handles additional arguments', async () => {
            vi.mocked(mockFn).mockResolvedValue(additionalMockReturn as never);

            const config: FsConfig = { rootDir: '/root', [operation]: true };
            const capability = capabilityFactory(config) as TestCapability;

            const result = await capability[operation]?.(...additionalArgs);

            expect(mockFn).toHaveBeenCalledWith(...additionalArgs);
            expect(result).toBe(additionalMockReturn);
          });
        }
      },
    );
  });
});
