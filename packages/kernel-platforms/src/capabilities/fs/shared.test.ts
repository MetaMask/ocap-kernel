import { describe, expect, it, vi } from 'vitest';

import {
  makeNoSymlinksCaveat,
  makeRootCaveat,
  makePathCaveat,
  makeCaveatedFsOperation,
  makeFsSpecification,
} from './shared.ts';
import type { ResolvePath, ReadFile, WriteFile, Readdir } from './types.ts';

describe('makeNoSymlinksCaveat', () => {
  it('allows real paths', async () => {
    const resolvePath: ResolvePath = vi.fn().mockResolvedValue('/real/path');
    const caveat = makeNoSymlinksCaveat(resolvePath);

    expect(await caveat('/real/path')).toBeUndefined();
    expect(resolvePath).toHaveBeenCalledWith('/real/path');
  });

  it('rejects symlinks', async () => {
    const resolvePath: ResolvePath = vi
      .fn()
      .mockResolvedValue('/resolved/symlink/path');
    const caveat = makeNoSymlinksCaveat(resolvePath);

    await expect(caveat('/symlink/path')).rejects.toThrow(
      'Symlinks are prohibited: /symlink/path',
    );
    expect(resolvePath).toHaveBeenCalledWith('/symlink/path');
  });

  it('handles string input', async () => {
    const input = '/path';
    const mockReturn = '/path';
    const resolvePath: ResolvePath = vi.fn().mockResolvedValue(mockReturn);
    const caveat = makeNoSymlinksCaveat(resolvePath);

    expect(await caveat(input)).toBeUndefined();
  });

  it('handles Buffer input', async () => {
    const input = Buffer.from('/path');
    const mockReturn = '/resolved/path';
    const resolvePath: ResolvePath = vi.fn().mockResolvedValue(mockReturn);
    const caveat = makeNoSymlinksCaveat(resolvePath);

    await expect(caveat(input)).rejects.toThrow(
      'Symlinks are prohibited: /path',
    );
  });
});

describe('makeRootCaveat', () => {
  it('allows paths within root', async () => {
    const resolvePath: ResolvePath = vi
      .fn()
      .mockResolvedValueOnce('/root/subdir/file.txt')
      .mockResolvedValueOnce('/root');
    const caveat = makeRootCaveat('/root', resolvePath);

    expect(await caveat('/root/subdir/file.txt')).toBeUndefined();
    expect(resolvePath).toHaveBeenCalledWith('/root/subdir/file.txt');
    expect(resolvePath).toHaveBeenCalledWith('/root');
  });

  it('rejects paths outside root', async () => {
    const resolvePath: ResolvePath = vi
      .fn()
      .mockResolvedValueOnce('/outside/file.txt')
      .mockResolvedValueOnce('/root');
    const caveat = makeRootCaveat('/root', resolvePath);

    await expect(caveat('/outside/file.txt')).rejects.toThrow(
      'Path /outside/file.txt is outside allowed root /root',
    );
  });

  it('allows root directory', async () => {
    const resolvePath: ResolvePath = vi
      .fn()
      .mockResolvedValueOnce('/root')
      .mockResolvedValueOnce('/root');
    const caveat = makeRootCaveat('/root', resolvePath);

    expect(await caveat('/root')).toBeUndefined();
  });

  it('rejects paths starting with root but outside', async () => {
    const resolvePath: ResolvePath = vi
      .fn()
      .mockResolvedValueOnce('/root-other/file.txt')
      .mockResolvedValueOnce('/different-root');
    const caveat = makeRootCaveat('/root', resolvePath);

    await expect(caveat('/root-other/file.txt')).rejects.toThrow(
      'Path /root-other/file.txt is outside allowed root /root',
    );
  });
});

describe('makePathCaveat', () => {
  it('combines symlink and root restrictions', async () => {
    const resolvePath: ResolvePath = vi
      .fn()
      .mockResolvedValueOnce('/root/subdir/file.txt')
      .mockResolvedValueOnce('/root/subdir/file.txt')
      .mockResolvedValueOnce('/root');
    const caveat = makePathCaveat('/root', resolvePath);

    await expect(caveat('/root/subdir/file.txt')).rejects.toThrow(
      'Path /root is outside allowed root /root',
    );
    expect(resolvePath).toHaveBeenCalledTimes(4);
  });

  it('rejects symlinks within root', async () => {
    const resolvePath: ResolvePath = vi
      .fn()
      .mockResolvedValueOnce('/resolved/symlink/path')
      .mockResolvedValueOnce('/resolved/symlink/path')
      .mockResolvedValueOnce('/root');
    const caveat = makePathCaveat('/root', resolvePath);

    await expect(caveat('/symlink/path')).rejects.toThrow(
      'Symlinks are prohibited: /symlink/path',
    );
  });

  it('rejects paths outside root', async () => {
    const resolvePath: ResolvePath = vi
      .fn()
      .mockResolvedValueOnce('/outside/file.txt')
      .mockResolvedValueOnce('/outside/file.txt')
      .mockResolvedValueOnce('/root');
    const caveat = makePathCaveat('/root', resolvePath);

    await expect(caveat('/outside/file.txt')).rejects.toThrow(
      'Path /root is outside allowed root /root',
    );
  });
});

describe('makeCaveatedFsOperation', () => {
  it('applies caveat before operation', async () => {
    const mockOperation = vi.fn().mockResolvedValue('result');
    const mockCaveat = vi.fn().mockResolvedValue(undefined);

    const caveatedOperation = makeCaveatedFsOperation(
      mockOperation,
      mockCaveat,
    );

    const result = await caveatedOperation('/path', 'arg2', 'arg3');

    expect(mockCaveat).toHaveBeenCalledWith('/path');
    expect(mockOperation).toHaveBeenCalledWith('/path', 'arg2', 'arg3');
    expect(result).toBe('result');
  });

  it('throws on caveat rejection', async () => {
    const mockOperation = vi.fn();
    const mockCaveat = vi.fn().mockRejectedValue(new Error('Path not allowed'));

    const caveatedOperation = makeCaveatedFsOperation(
      mockOperation,
      mockCaveat,
    );

    await expect(caveatedOperation('/path')).rejects.toThrow(
      'Path not allowed',
    );
    expect(mockCaveat).toHaveBeenCalledWith('/path');
    expect(mockOperation).not.toHaveBeenCalled();
  });

  it('handles void operations', async () => {
    const mockOperation = vi.fn().mockResolvedValue(undefined);
    const mockCaveat = vi.fn().mockResolvedValue(undefined);

    const caveatedOperation = makeCaveatedFsOperation(
      mockOperation,
      mockCaveat,
    );

    expect(await caveatedOperation('/path')).toBeUndefined();
    expect(mockCaveat).toHaveBeenCalledWith('/path');
    expect(mockOperation).toHaveBeenCalledWith('/path');
  });
});

describe('makeFsSpecification', () => {
  const createMockSpecification = () => {
    const mockReadFile: ReadFile = vi.fn();
    const mockWriteFile: WriteFile = vi.fn();
    const mockReaddir: Readdir = vi.fn();
    const resolvePath: ResolvePath = vi.fn().mockResolvedValue('/path');

    return {
      specification: makeFsSpecification({
        resolvePath,
        makeReadFile: () => mockReadFile,
        makeWriteFile: () => mockWriteFile,
        makeReaddir: () => mockReaddir,
      }),
      mockReadFile,
      mockWriteFile,
      mockReaddir,
    };
  };

  it('creates specification with all capabilities enabled', () => {
    const { specification } = createMockSpecification();

    expect(specification).toHaveProperty('configStruct');
    expect(specification).toHaveProperty('capabilityFactory');
  });

  it('creates capability with readFile', () => {
    const { specification } = createMockSpecification();
    const config = { rootDir: '/root', readFile: true };
    const capability = specification.capabilityFactory(config);

    expect(capability).toHaveProperty('readFile');
    expect(capability).not.toHaveProperty('writeFile');
    expect(capability).not.toHaveProperty('readdir');
  });

  it('creates capability with writeFile', () => {
    const { specification } = createMockSpecification();
    const config = { rootDir: '/root', writeFile: true };
    const capability = specification.capabilityFactory(config);

    expect(capability).not.toHaveProperty('readFile');
    expect(capability).toHaveProperty('writeFile');
    expect(capability).not.toHaveProperty('readdir');
  });

  it('creates capability with readdir', () => {
    const { specification } = createMockSpecification();
    const config = { rootDir: '/root', readdir: true };
    const capability = specification.capabilityFactory(config);

    expect(capability).not.toHaveProperty('readFile');
    expect(capability).not.toHaveProperty('writeFile');
    expect(capability).toHaveProperty('readdir');
  });

  it('creates capability with all operations', () => {
    const { specification } = createMockSpecification();
    const config = {
      rootDir: '/root',
      readFile: true,
      writeFile: true,
      readdir: true,
    };
    const capability = specification.capabilityFactory(config);

    expect(capability).toHaveProperty('readFile');
    expect(capability).toHaveProperty('writeFile');
    expect(capability).toHaveProperty('readdir');
  });

  it('creates capability with no operations', () => {
    const { specification } = createMockSpecification();
    const config = { rootDir: '/root' };
    const capability = specification.capabilityFactory(config);

    expect(capability).not.toHaveProperty('readFile');
    expect(capability).not.toHaveProperty('writeFile');
    expect(capability).not.toHaveProperty('readdir');
  });
});
