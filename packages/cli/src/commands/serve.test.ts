import '@ocap/shims/endoify';
import type { BundleSourceResult } from '@endo/bundle-source';
import { isObject, hasProperty } from '@metamask/utils';
import { makeCounter, stringify } from '@ocap/utils';
import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import nodeFetch from 'node-fetch';
import { join, resolve } from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { getServer } from './serve.js';
import { getTestBundles } from '../../test/bundles.js';

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

  describe('getServer', () => {
    it('returns an object with a listen property', () => {
      const server = getServer({
        server: {
          port: 3000,
        },
        dir: testBundleRoot,
      });

      expect(server).toHaveProperty('listen');
    });

    it(`throws if 'dir' is not specified`, () => {
      expect(() => getServer({ server: { port: 3000 } })).toThrow(/dir/u);
    });
  });

  describe('server', () => {
    const getServerPort = makeCounter(3000);

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const makeServer = (root: string = testBundleRoot) => {
      const port = getServerPort();
      const { listen } = getServer({
        server: {
          port,
        },
        dir: root,
      });
      const requestBundle = async (path: string): Promise<unknown> =>
        await nodeFetch(`http://localhost:${port}/${path}`).then(
          async (resp) => {
            if (resp.ok) {
              return resp.json();
            }
            throw new Error(resp.statusText, { cause: resp.status });
          },
        );
      return {
        listen,
        requestBundle,
      };
    };

    it.sequential('serves bundles', async () => {
      const bundleName = 'test.bundle';
      const bundleRoot = join(testBundleRoot, '..');
      const bundlePath = join(bundleRoot, bundleName);
      const { listen, requestBundle } = makeServer(bundleRoot);

      const { close } = await listen();

      try {
        const expectedBundleHash = await readFile(bundlePath).then(
          (content) => {
            const json = JSON.parse(content.toString());
            if (!isBundleSourceResult(json)) {
              throw new Error(
                [
                  `Could not read expected bundle ${bundlePath}`,
                  `Parsed JSON: ${stringify(json)}`,
                ].join('\n'),
              );
            }
            return json.endoZipBase64Sha512;
          },
        );

        const receivedBundleHash = await requestBundle(bundleName).then(
          (json) => {
            if (!isBundleSourceResult(json)) {
              return `Received unexpected response from server: ${stringify(json)}`;
            }
            return createHash('sha512')
              .update(Buffer.from(json.endoZipBase64))
              .digest('hex');
          },
        );

        expect(receivedBundleHash).toStrictEqual(expectedBundleHash);
      } finally {
        await close();
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
