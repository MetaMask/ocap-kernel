import { beforeEach, describe, expect, it, vi } from 'vitest';

import { latestVersion, syncTemplateDependencies } from './dependency-sync.ts';

const mocks = vi.hoisted(() => ({
  exec: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  exec: mocks.exec,
}));

vi.mock('node:util', () => ({
  promisify: vi.fn().mockImplementation((foo) => foo),
}));

vi.mock('node:fs/promises', () => ({
  readFile: mocks.readFile,
  writeFile: mocks.writeFile,
}));

describe('latestVersion', () => {
  it.each([
    {
      name: 'should handle patch version updates',
      versions: ['1.0.0', '1.0.1', '1.0.2'],
      expected: '1.0.2',
    },
    {
      name: 'should handle minor version updates',
      versions: ['1.0.0', '1.1.0', '1.2.0'],
      expected: '1.2.0',
    },
    {
      name: 'should handle major version updates',
      versions: ['1.0.0', '2.0.0', '3.0.0'],
      expected: '3.0.0',
    },
    {
      name: 'should handle different version lengths',
      versions: ['1.0', '1.0.0', '1.0.0.0'],
      expected: '1.0.0.0',
    },
    {
      name: 'should handle mixed version formats',
      versions: ['1.0', '1.0.1', '1.1'],
      expected: '1.1',
    },
    {
      name: 'should handle versions with missing parts',
      versions: ['1', '1.0', '1.0.0'],
      expected: '1.0.0',
    },
    {
      name: 'should handle versions with leading zeros',
      versions: ['1.01', '1.1', '1.10'],
      expected: '1.10',
    },
    {
      name: 'should handle versions with different segment counts',
      versions: ['1.0.0.0', '1.0.0', '1.0'],
      expected: '1.0.0.0',
    },
    {
      name: 'should handle versions with same prefix but different lengths',
      versions: ['1.0.0', '1.0.0.1', '1.0.0.0.1'],
      expected: '1.0.0.1',
    },
  ])('$name', ({ versions, expected }) => {
    expect(latestVersion(versions)).toBe(expected);
  });

  it('should throw an error if no versions are provided', () => {
    expect(() => {
      latestVersion([]);
    }).toThrow('No versions provided');
  });
});

describe('syncTemplateDependencies', () => {
  const mockWorkspaceRoot = '/workspace';
  const mockTemplatePath =
    'packages/create-package/src/package-template/package.json';
  const mockPackageJson = {
    devDependencies: {
      'package-a': '1.0.0',
      'package-b': '2.0.0',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeMockExec =
    (matches: Record<string, string>) => async (command: string) => {
      for (const [match, value] of Object.entries(matches)) {
        if (command.includes(match)) {
          return { stdout: value };
        }
      }
      return { stdout: '' };
    };

  describe('syncTemplateDependencies', () => {
    it('should synchronize multiple dependencies with their latest versions', async () => {
      // Mock the grep command output
      mocks.exec.mockImplementation(
        makeMockExec({
          'package-a':
            '"package-a": "1.0.0"\n"package-a": "1.1.0"\n"package-a": "1.2.0"',
          'package-b': '"package-b": "2.0.0"\n"package-b": "2.1.0"',
        }),
      );

      // Mock reading the template package.json
      mocks.readFile.mockResolvedValue(JSON.stringify(mockPackageJson));

      // Call the function
      await syncTemplateDependencies(mockWorkspaceRoot, mockTemplatePath);

      // Verify the package.json was updated with the latest versions
      expect(mocks.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(mockTemplatePath),
        expect.stringContaining('"package-a": "1.2.0"'),
      );
      expect(mocks.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(mockTemplatePath),
        expect.stringContaining('"package-b": "2.1.0"'),
      );
    });

    it('should throw an error if the package.json cannot be read', async () => {
      mocks.readFile.mockRejectedValue(new Error('Failed to read file'));

      await expect(
        syncTemplateDependencies(mockWorkspaceRoot, mockTemplatePath),
      ).rejects.toThrow(/Failed to read file/u);
    });

    it('should throw an error if the package.json cannot be written', async () => {
      // Mock the grep command output
      mocks.exec.mockImplementation(
        makeMockExec({
          'package-a':
            '"package-a": "1.0.0"\n"package-a": "1.1.0"\n"package-a": "1.2.0"',
          'package-b': '"package-b": "2.0.0"\n"package-b": "2.1.0"',
        }),
      );

      // Mock reading the template package.json
      mocks.readFile.mockResolvedValue(JSON.stringify(mockPackageJson));

      // Mock writing the package.json to fail
      mocks.writeFile.mockRejectedValue(new Error('Failed to write file'));

      await expect(
        syncTemplateDependencies(mockWorkspaceRoot, mockTemplatePath),
      ).rejects.toThrow(/Failed to write file/u);
    });

    it('should log a warning and return if no devDependencies', async () => {
      const mockConsoleWarn = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      mocks.readFile.mockResolvedValue(JSON.stringify({}));
      await syncTemplateDependencies('/workspace', 'template.json');
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        'No devDependencies found in template package.json',
      );
      mockConsoleWarn.mockRestore();
    });

    it('should throw if no versions are found for a dependency', async () => {
      mocks.readFile.mockResolvedValue(
        JSON.stringify({ devDependencies: { foo: '1.0.0' } }),
      );
      mocks.exec.mockImplementation(makeMockExec({}));
      await expect(
        syncTemplateDependencies('/workspace', 'template.json'),
      ).rejects.toThrow('No versions found for dependency: foo');
    });

    it('should throw if writing the file fails', async () => {
      mocks.readFile.mockResolvedValue(
        JSON.stringify({ devDependencies: { foo: '1.0.0' } }),
      );
      mocks.exec.mockImplementation(
        makeMockExec({
          foo: '"foo": "1.0.0"',
        }),
      );
      mocks.writeFile.mockRejectedValue(new Error('write failed'));
      await expect(
        syncTemplateDependencies('/workspace', 'template.json'),
      ).rejects.toThrow(/write failed/u);
    });
  });
});
