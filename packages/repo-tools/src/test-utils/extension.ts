import { chromium } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const sessionPath = path.resolve(os.tmpdir(), 'ocap-test');

type Options = {
  contextId?: string | undefined;
  extensionPath: string;
  onPageLoad?: (popupPage: Page) => Promise<void> | undefined;
};

/**
 * Creates an extension context, extension ID, and popup page.
 *
 * @param options - Options for the extension
 * @param options.contextId - Optional context identifier to create separate browser contexts.
 * If not provided, uses the TEST_WORKER_INDEX environment variable.
 * @param options.extensionPath - The path to the extension dist folder.
 * @param options.onPageLoad - Optional callback to run after the extension is loaded. Useful for
 * e.g. waiting for components to be visible before proceeding with a test.
 * @returns The extension context, extension ID, and popup page
 */
export const makeLoadExtension = async ({
  contextId,
  extensionPath,
  onPageLoad = async () => Promise.resolve(),
}: Options): Promise<{
  browserContext: BrowserContext;
  extensionId: string;
  popupPage: Page;
}> => {
  const workerIndex = process.env.TEST_WORKER_INDEX ?? '0';
  // Use provided contextId or fall back to workerIndex for separate user data dirs
  const effectiveContextId = contextId ?? workerIndex;
  const userDataDir = path.join(sessionPath, effectiveContextId);
  await rm(userDataDir, { recursive: true, force: true });

  const browserArgs = [
    `--disable-features=ExtensionDisableUnsupportedDeveloper`,
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    '--lang=en-US',
  ];

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
  await onPageLoad(popupPage);

  return { browserContext, extensionId, popupPage };
};
