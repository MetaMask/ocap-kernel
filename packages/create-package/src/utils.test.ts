import { execa } from 'execa';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { format as prettierFormat } from 'prettier';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock, MockInstance } from 'vitest';

import { MonorepoFile } from './constants.ts';
import * as fsUtils from './fs-utils.ts';
import type { FileMap } from './fs-utils.ts';
import type { MonorepoFileData, PackageData } from './utils.ts';
import { finalizeAndWriteData, readMonorepoFiles } from './utils.ts';

vi.mock('node:fs', () => ({
  promises: {
    mkdir: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    access: vi.fn(),
  },
}));

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

vi.mock('prettier', () => ({
  format: vi.fn(),
}));

vi.mock('./fs-utils.ts', () => ({
  readAllFiles: vi.fn(),
  writeFiles: vi.fn(),
}));

describe('create-package/utils', () => {
  describe('readMonorepoFiles', () => {
    const tsConfig = JSON.stringify({
      references: [{ path: '../packages/foo' }],
    });
    const tsConfigBuild = JSON.stringify({
      references: [{ path: '../packages/foo' }],
    });

    it('should read the expected monorepo files', async () => {
      (fs.readFile as Mock).mockImplementation(async (filePath: string) => {
        switch (path.basename(filePath) as MonorepoFile) {
          case MonorepoFile.TsConfig:
            return tsConfig;
          case MonorepoFile.TsConfigBuild:
            return tsConfigBuild;
          default:
            throw new Error(`Unexpected file: ${path.basename(filePath)}`);
        }
      });

      const monorepoFileData = await readMonorepoFiles();

      expect(monorepoFileData).toStrictEqual({
        tsConfig: JSON.parse(tsConfig),
        tsConfigBuild: JSON.parse(tsConfigBuild),
      });
    });
  });

  describe('finalizeAndWriteData', () => {
    const getPackageData = (): PackageData => ({
      name: '@ocap/foo',
      description: 'A foo package.',
      directoryName: 'foo',
      currentYear: '2023',
    });

    const getMonorepoFileData = (): MonorepoFileData => ({
      tsConfig: {
        references: [{ path: './packages/bar' }],
      },
      tsConfigBuild: {
        references: [{ path: './packages/bar' }],
      },
    });

    const getReadFilesResult = (): FileMap => ({
      'src/index.ts': 'export default 42;',
      'src/index.test.ts': 'export default 42;',
      'mock1.file':
        'CURRENT_YEAR @ocap/template-package PACKAGE_DESCRIPTION template-package',
      'mock2.file': 'CURRENT_YEAR @ocap/template-package',
      'mock3.file': 'PACKAGE_DESCRIPTION template-package',
    });

    let consoleErrorSpy: MockInstance;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error');
    });

    it('should write the expected files', async () => {
      const packageData = getPackageData();

      const monorepoFileData = getMonorepoFileData();

      (fs.access as Mock).mockRejectedValueOnce(
        Object.assign(new Error(), {
          code: 'ENOENT',
        }),
      );

      (fsUtils.readAllFiles as Mock).mockResolvedValueOnce(
        getReadFilesResult(),
      );

      (prettierFormat as Mock).mockImplementation((input) => input);

      await finalizeAndWriteData(packageData, monorepoFileData);

      // processTemplateFiles and writeFiles
      expect(fsUtils.readAllFiles).toHaveBeenCalledTimes(1);
      expect(fsUtils.readAllFiles).toHaveBeenCalledWith(
        expect.stringMatching(/packages\/template-package$/u),
      );

      expect(fsUtils.writeFiles).toHaveBeenCalledTimes(1);
      expect(fsUtils.writeFiles).toHaveBeenCalledWith(
        expect.stringMatching(/packages\/foo$/u),
        {
          'src/index.ts': 'export default 42;',
          'src/index.test.ts': 'export default 42;',
          'mock1.file': '2023 @ocap/foo A foo package. foo',
          'mock2.file': '2023 @ocap/foo',
          'mock3.file': 'A foo package. foo',
        },
      );

      // Writing monorepo files
      expect(fs.writeFile).toHaveBeenCalledTimes(2);
      expect(prettierFormat).toHaveBeenCalledTimes(2);
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/tsconfig\.json$/u),
        JSON.stringify({
          references: [{ path: './packages/bar' }, { path: './packages/foo' }],
        }),
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/tsconfig\.build\.json$/u),
        JSON.stringify({
          references: [
            { path: './packages/bar' },
            { path: './packages/foo/tsconfig.build.json' },
          ],
        }),
      );

      // Postprocessing
      expect(execa).toHaveBeenCalledTimes(2);
      expect(execa).toHaveBeenCalledWith('yarn', ['install'], {
        cwd: expect.any(String),
      });
      expect(execa).toHaveBeenCalledWith('yarn', ['constraints', '--fix'], {
        cwd: expect.any(String),
      });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should warn if constraints fail', async () => {
      const packageData = getPackageData();

      const monorepoFileData = getMonorepoFileData();

      (fs.access as Mock).mockRejectedValueOnce(
        Object.assign(new Error(), {
          code: 'ENOENT',
        }),
      );

      (fsUtils.readAllFiles as Mock).mockResolvedValueOnce(
        getReadFilesResult(),
      );

      (prettierFormat as Mock).mockImplementation((input) => input);

      (execa as Mock)
        .mockResolvedValueOnce(undefined)
        .mockImplementationOnce(() => {
          throw new Error('foo');
        });

      await finalizeAndWriteData(packageData, monorepoFileData);

      // Postprocessing
      expect(execa).toHaveBeenCalledTimes(2);
      expect(execa).toHaveBeenCalledWith('yarn', ['install'], {
        cwd: expect.any(String),
      });
      expect(execa).toHaveBeenCalledWith('yarn', ['constraints', '--fix'], {
        cwd: expect.any(String),
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Warning: Failed to run "yarn constraints --fix". You will need to re-run it manually.',
      );
    });

    it('throws if the package directory already exists', async () => {
      const packageData: PackageData = {
        name: '@ocap/foo',
        description: 'A foo package.',
        directoryName: 'foo',
        currentYear: '2023',
      };

      const monorepoFileData = {
        tsConfig: {
          references: [{ path: './packages/bar' }],
        },
        tsConfigBuild: {
          references: [{ path: './packages/bar' }],
        },
      };

      (fs.access as Mock).mockResolvedValueOnce(undefined);

      await expect(
        finalizeAndWriteData(packageData, monorepoFileData),
      ).rejects.toThrow(/^The package directory already exists:/u);

      expect(fs.mkdir).not.toHaveBeenCalled();
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('handles errors from fs.exists', async () => {
      const packageData = getPackageData();
      const monorepoFileData = getMonorepoFileData();

      (fs.access as Mock).mockRejectedValueOnce(new Error('foo'));

      await expect(
        finalizeAndWriteData(packageData, monorepoFileData),
      ).rejects.toThrow(/^foo$/u);
    });
  });
});
