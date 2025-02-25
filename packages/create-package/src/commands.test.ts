import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { Arguments } from 'yargs';

import type { CreatePackageOptions } from './commands.js';
import { createPackageHandler } from './commands.js';
import * as utils from './utils.js';

vi.mock('./utils.js', () => ({
  finalizeAndWriteData: vi.fn(),
  readMonorepoFiles: vi.fn(),
}));

// January 2 to avoid time zone issues.
vi.useFakeTimers({
  now: new Date('2023-01-02'),
  toFake: ['Date'],
});

describe('create-package/commands', () => {
  describe('createPackageHandler', () => {
    it('should create the expected package', async () => {
      (utils.readMonorepoFiles as Mock).mockResolvedValue({
        tsConfig: {
          references: [{ path: '../packages/foo' }],
        },
        tsConfigBuild: {
          references: [{ path: '../packages/foo' }],
        },
        nodeVersions: '>=18.0.0',
      });

      const args: Arguments<CreatePackageOptions> = {
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/naming-convention
        _: [],
        $0: 'create-package',
        name: '@ocap/new-package',
        description: 'A new MetaMask package.',
      };

      await createPackageHandler(args);

      expect(utils.finalizeAndWriteData).toHaveBeenCalledTimes(1);
      expect(utils.finalizeAndWriteData).toHaveBeenCalledWith(
        {
          name: '@ocap/new-package',
          description: 'A new MetaMask package.',
          directoryName: 'new-package',
          nodeVersions: '>=18.0.0',
          currentYear: '2023',
        },
        {
          tsConfig: {
            references: [{ path: '../packages/foo' }],
          },
          tsConfigBuild: {
            references: [{ path: '../packages/foo' }],
          },
          nodeVersions: '>=18.0.0',
        },
      );
    });
  });
});
