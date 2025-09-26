import { chromium, expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { rm } from 'fs/promises';
import { fileURLToPath } from 'node:url';
import os from 'os';
import path, { dirname } from 'path';

export const sessionPath = path.resolve(os.tmpdir(), 'ocap-test');

/**
 * Creates an extension context, extension ID, and popup page.
 *
 * @param contextId - Optional context identifier to create separate browser contexts.
 *                    If not provided, uses the TEST_WORKER_INDEX environment variable.
 * @returns The extension context, extension ID, and popup page
 */
export const makeLoadExtension = async (
  contextId?: string,
): Promise<{
  browserContext: BrowserContext;
  extensionId: string;
  popupPage: Page;
}> => {
  // eslint-disable-next-line n/no-process-env
  const workerIndex = process.env.TEST_WORKER_INDEX ?? '0';
  // Use provided contextId or fall back to workerIndex for separate user data dirs
  const effectiveContextId = contextId ?? workerIndex;
  const userDataDir = path.join(sessionPath, effectiveContextId);
  await rm(userDataDir, { recursive: true, force: true });

  // Get the absolute path to the extension
  const extensionPath = path.resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../dist',
  );

  const browserArgs = [
    `--disable-features=ExtensionDisableUnsupportedDeveloper`,
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    '--lang=en-US',
  ];

  // eslint-disable-next-line n/no-process-env
  const isHeadless = process.env.npm_lifecycle_event === 'test:e2e';
  if (isHeadless) {
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
  // Wait for the default subcluster accordion to be visible
  await expect(popupPage.locator('text=Subcluster s1 - 3 Vats')).toBeVisible();

  return { browserContext, extensionId, popupPage };
};
