import { chromium } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { rm } from 'fs/promises';
import os from 'os';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

export const sessionPath = path.resolve(os.tmpdir(), 'ocap-test');

/**
 * Creates an extension context, extension ID, and popup page.
 *
 * @returns The extension context, extension ID, and popup page
 */
export const makeLoadExtension = async (): Promise<{
  browserContext: BrowserContext;
  extensionId: string;
  popupPage: Page;
}> => {
  // eslint-disable-next-line n/no-process-env
  const workerIndex = process.env.TEST_WORKER_INDEX ?? '0';
  const userDataDir = path.join(sessionPath, workerIndex);
  await rm(userDataDir, { recursive: true, force: true });

  // Get the absolute path to the extension
  const extensionPath = path.resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../dist',
  );

  const browserArgs = [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    '--lang=en-US',
  ];

  // eslint-disable-next-line n/no-process-env
  const isDebugging = process.env.npm_lifecycle_event === 'test:e2e:debug';
  if (!isDebugging) {
    browserArgs.push(`--headless=new`);
  }

  // Launch the browser with the extension
  const browserContext = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: browserArgs,
  });

  // Wait for the extension to be loaded
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const chromeExtensionURLIdMatcher = /^chrome-extension:\/\/([^/]+)/u;
  const serviceWorkers = browserContext.serviceWorkers();
  const extensionId = serviceWorkers[0]
    ?.url()
    .match(chromeExtensionURLIdMatcher)?.[1];

  if (!extensionId) {
    throw new Error('Extension ID not found');
  }

  const popupPage = await browserContext.newPage();
  await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

  return { browserContext, extensionId, popupPage };
};
