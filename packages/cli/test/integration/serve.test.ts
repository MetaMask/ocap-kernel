import '@metamask/kernel-shims/endoify';
import { isVatBundle, makeCounter, stringify } from '@metamask/kernel-utils';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { getServer } from '../../src/commands/serve.ts';
import { defaultConfig } from '../../src/config.ts';
import { withTimeout } from '../../src/utils.ts';
import { makeTestBundleStage, validTestBundleNames } from '../bundles.ts';

describe('serve', async () => {
  beforeEach(() => {
    vi.resetModules();
  });

  const { testBundleRoot, getTestBundleSpecs } = await makeTestBundleStage();
  const testBundleSpecs = getTestBundleSpecs(validTestBundleNames);

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
        if (!isVatBundle(expectedBundleContent)) {
          throw new Error(
            [
              `Could not read expected bundle ${bundlePath}`,
              `Parsed JSON: ${stringify(expectedBundleContent)}`,
            ].join('\n'),
          );
        }
        const expectedCode = expectedBundleContent.code;

        const receivedBundleContent = await requestBundle(bundleName);
        if (!isVatBundle(receivedBundleContent)) {
          throw new Error(
            `Received unexpected response from server: ${stringify(receivedBundleContent)}`,
          );
        }

        expect(receivedBundleContent.code).toStrictEqual(expectedCode);
      } finally {
        await withTimeout(close(), 400).catch(console.error);
      }
    });

    it('only serves *.bundle files', async () => {
      const { listen, requestBundle } = makeServer();

      const source = testBundleSpecs[0]?.source as string;

      const { close } = await listen();
      try {
        await expect(requestBundle(source)).rejects.toMatchObject({
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
