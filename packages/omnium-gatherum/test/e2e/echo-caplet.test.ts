import { test, expect } from '@playwright/test';
import type {
  BrowserContext,
  Worker as PlaywrightWorker,
} from '@playwright/test';

import { loadExtension } from './utils.ts';

test.describe('Echo caplet', () => {
  let browserContext: BrowserContext;
  let serviceWorker: PlaywrightWorker;

  test.beforeEach(async () => {
    const extension = await loadExtension();
    browserContext = extension.browserContext;

    const workers = browserContext.serviceWorkers();
    const sw = workers[0];
    if (!sw) {
      throw new Error('No service worker found');
    }
    serviceWorker = sw;
  });

  test.afterEach(async () => {
    await browserContext.close();
  });

  test('loads, installs, and calls the echo caplet', async () => {
    // Wait for the controller vat to initialize by polling omnium.caplet.list()
    await expect(async () => {
      await serviceWorker.evaluate(async () => globalThis.omnium.caplet.list());
    }).toPass({ timeout: 30_000 });

    // Load the echo caplet manifest and bundle
    const { manifest } = await serviceWorker.evaluate(async () =>
      globalThis.omnium.caplet.load('echo'),
    );

    // Install the echo caplet
    await serviceWorker.evaluate(
      async (capletManifest) =>
        globalThis.omnium.caplet.install(capletManifest),
      manifest,
    );

    // Call the echo caplet method
    const result = await serviceWorker.evaluate(async () =>
      globalThis.omnium.caplet.callCapletMethod('echo', 'echo', [
        'Hello, world!',
      ]),
    );

    expect(result).toStrictEqual({
      body: '#"echo: Hello, world!"',
      slots: [],
    });
  });
});
