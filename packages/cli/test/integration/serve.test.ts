import '@ocap/shims/endoify';
import type { BundleSourceResult } from '@endo/bundle-source';
import { isObject, hasProperty } from '@metamask/utils';
import { makeCounter, stringify } from '@ocap/utils';
import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { join, resolve } from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { getServer } from '../../src/commands/serve.js';
import { defaultConfig } from '../../src/config.js';
import { withTimeout } from '../../src/utils.js';
import { getTestBundles } from '../bundles.js';

const isBundleSourceResult = (
  value: unknown,
): value is BundleSourceResult<'endoZipBase64'> =>
  isObject(value) &&
  hasProperty(value, 'moduleFormat') &&
  value.moduleFormat === 'endoZipBase64' &&
  hasProperty(value, 'endoZipBase64') &&
  typeof value.endoZipBase64 === 'string' &&
  hasProperty(value, 'endoZipBase64Sha512') &&
  typeof value.endoZipBase64Sha512 === 'string';

describe('serve', async () => {
  beforeEach(() => {
    vi.resetModules();
  });

  const { testBundleRoot, testBundleSpecs } = await getTestBundles();

  const getServerPort = makeCounter(defaultConfig.server.port);

  describe('getServer', () => {
    it('returns an object with a listen property', () => {
      const server = getServer({
        server: {
          port: getServerPort(),
        },
        dir: testBundleRoot,
      });

      expect(server).toHaveProperty('listen');
    });

    it(`throws if 'dir' is not specified`, () => {
      expect(() => getServer({ server: { port: getServerPort() } })).toThrow(
        /dir/u,
      );
    });
  });

  describe('server', () => {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const makeServer = (root: string = testBundleRoot) => {
      const port = getServerPort();
      const { listen } = getServer({
        server: {
          port,
        },
        dir: root,
      });
      const url = `http://localhost:${port}`;
      const requestBundle = async (path: string): Promise<unknown> => {
        const resp = await fetch(`${url}/${path}`);
        if (resp.ok) {
          return resp.json();
        }
        throw new Error(resp.statusText, { cause: resp.status });
      };
      return {
        listen,
        requestBundle,
      };
    };

    it('serves bundles', async () => {
      const bundleName = 'test.bundle';
      const bundleRoot = join(testBundleRoot, '..');
      const bundlePath = join(bundleRoot, bundleName);
      const { listen, requestBundle } = makeServer(bundleRoot);

      const { close } = await listen();

      try {
        const bundleData = await readFile(bundlePath);
        const expectedBundleContent = JSON.parse(bundleData.toString());
        if (!isBundleSourceResult(expectedBundleContent)) {
          throw new Error(
            [
              `Could not read expected bundle ${bundlePath}`,
              `Parsed JSON: ${stringify(expectedBundleContent)}`,
            ].join('\n'),
          );
        }
        const expectedBundleHash = expectedBundleContent.endoZipBase64Sha512;

        const receivedBundleContent = await requestBundle(bundleName);
        if (!isBundleSourceResult(receivedBundleContent)) {
          throw new Error(
            `Received unexpected response from server: ${stringify(receivedBundleContent)}`,
          );
        }
        const receivedBundleHash = createHash('sha512')
          .update(Buffer.from(receivedBundleContent.endoZipBase64))
          .digest('hex');

        expect(receivedBundleHash).toStrictEqual(expectedBundleHash);
      } finally {
        await withTimeout(close(), 400).catch(console.error);
      }
    });

    it('only serves *.bundle files', async () => {
      const { listen, requestBundle } = makeServer();

      const script = testBundleSpecs[0]?.script as string;

      const { close } = await listen();
      try {
        await expect(requestBundle(script)).rejects.toMatchObject({
          cause: 404,
        });
      } finally {
        await close();
      }
    });

    it('only serves files in the target dir', async () => {
      const { listen, requestBundle } = makeServer();

      const extraneousBundle = resolve(testBundleRoot, '../test.bundle');

      const { close } = await listen();
      try {
        await expect(requestBundle(extraneousBundle)).rejects.toMatchObject({
          cause: 404,
        });
      } finally {
        await close();
      }
    });
  });
});
