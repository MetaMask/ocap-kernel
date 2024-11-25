import { chromium } from '@playwright/test';
import os from 'os';
import type { BrowserContext, Page } from '@playwright/test';
import { mkdir, rm } from 'fs/promises';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

export const sessionPath = path.resolve(os.tmpdir(), 'ocap-test');

/**
 * Create an extension.
 *
 * @returns The extension context, extension ID, and popup page
 */
export const createExtension = async (): Promise<{
  browserContext: BrowserContext;
  extensionId: string;
  popupPage: Page;
}> => {
  const workerIndex = process.env.TEST_WORKER_INDEX || '0';
  const userDataDir = path.join(sessionPath, workerIndex);
  // Create a user data directory for the extension
  //   try {
  //     await rm(userDataDir, { recursive: true, force: true });
  //   } catch {
  //     // Ignore if directory doesn't exist
  //   }
  //   await mkdir(userDataDir, { recursive: true });

  // Get the absolute path to the extension
  const extensionPath = path.resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../dist',
  );

  console.log('Loading extension from:', extensionPath);

  const browserArgs = [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    '--lang=en-US',
  ];

  //   if (options.headless != false) browserArgs.push(`--headless=new`);

  // Launch the browser with the extension
  const browserContext = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: browserArgs,
  });

  // Wait for the extension to be loaded
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Get the background page of the extension
  //   const backgroundPages = browserContext.backgroundPages();
  //   const backgroundPage = backgroundPages[0];
  //   if (!backgroundPage) {
  //     throw new Error('Background page not found');
  //   }

  //   // Extract and validate extension ID from the background page URL
  //   const extensionId = backgroundPage.url().split('/')[2];
  //   if (!extensionId || !/^[a-z]{32}$/u.test(extensionId)) {
  //     throw new Error(`Invalid extension ID: ${extensionId}`);
  //   }
  //   console.log('Extension ID:', extensionId);

  //   // Create a new page for the popup
  //   const popupPage = await browserContext.newPage();
  //   await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

  const extensionId = 'ocap-extension';
  const popupPage = await browserContext.newPage();

  const serviceWorkers = await browserContext.serviceWorkers();
  console.log('Service workers:', serviceWorkers);
  return { browserContext, extensionId, popupPage };
};

/**
 * Get the extension URL.
 *
 * @param extensionId - The extension ID
 * @returns The extension URL
 */
export function getExtensionUrl(extensionId: string): string {
  return `chrome-extension://${extensionId}/popup.html`;
}

/**
 * Get the extension background URL.
 *
 * @param extensionId - The extension ID
 * @returns The extension background URL
 */
export function getExtensionBackgroundUrl(extensionId: string): string {
  return `chrome://extensions/?id=${extensionId}`;
}
