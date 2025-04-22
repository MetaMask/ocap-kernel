/* eslint-disable require-atomic-updates */
import { chromium } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { Plugin as VitePlugin } from 'vite';

// Re-implemented here because we live in hell.
const delay = async (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Vite plugin that opens the extension's popup in a browser context
 * and reloads the extension when the bundle is written.
 *
 * @param options - Options for the plugin
 * @param options.extensionPath - The directory of the built extension
 * @returns Vite plugin
 */
export function extensionDev({
  extensionPath,
}: {
  extensionPath: string;
}): VitePlugin {
  const state = {
    browserContext: null as BrowserContext | null,
    popupPage: null as Page | null,
    extensionId: null as string | null,
  };

  return {
    name: 'vite:extension-dev',

    // This is called when the server starts
    async configureServer(server) {
      // Close the browser context when the server shuts down
      server.httpServer?.once('close', () => {
        closeBrowserContext().catch((error) => {
          console.error('Error closing browser context:', error);
        });
      });
    },

    // This is called when the bundle is written
    async writeBundle() {
      if (state.browserContext) {
        await reloadExtension();
        return;
      }
      await launchBrowserContext();
      await openPopup();
    },
  };

  /**
   * Launch the browser context.
   *
   * @returns Promise that resolves when the browser context is launched
   */
  async function launchBrowserContext(): Promise<void> {
    // Launch Chrome with the extension loaded
    const browserContext = await chromium.launchPersistentContext('', {
      headless: false,
      viewport: null, // Let the OS window control the size
      ignoreDefaultArgs: ['--enable-automation'],
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });

    // Close the initial blank page that opens with the browser
    const pages = browserContext.pages();
    await Promise.all(pages.map(async (page) => await page.close()));

    // Wait for the extension to be loaded
    await delay(1000);

    const chromeExtensionURLIdMatcher = /^chrome-extension:\/\/([^/]+)/u;
    const serviceWorkers = browserContext.serviceWorkers();
    const extensionId = serviceWorkers[0]
      ?.url()
      .match(chromeExtensionURLIdMatcher)?.[1];

    if (!extensionId) {
      console.error('Extension ID not found');
      await browserContext.close();
      return;
    }

    // Open the extensions page for our extension
    const extensionsPage = await browserContext.newPage();
    await extensionsPage.setViewportSize({ width: 1300, height: 700 });
    await extensionsPage.goto(`chrome://extensions/?id=${extensionId}`);

    // Update state after all checks
    state.browserContext = browserContext;
    state.extensionId = extensionId;
  }

  /**
   * Open the extension's popup.
   *
   * @returns Promise that resolves when the popup is opened
   */
  async function openPopup(): Promise<void> {
    if (!state.browserContext || !state.extensionId) {
      return;
    }

    if (state.popupPage && !state.popupPage.isClosed()) {
      await state.popupPage.close();
    }

    const newPage = await state.browserContext.newPage();
    await newPage.goto(`chrome-extension://${state.extensionId}/popup.html`);
    state.popupPage = newPage;
  }

  /**
   * Reload the extension.
   *
   * @returns Promise that resolves when the extension is reloaded
   */
  async function reloadExtension(): Promise<void> {
    if (!state.browserContext || !state.extensionId) {
      return;
    }

    await delay(1000);

    const serviceWorkers = state.browserContext.serviceWorkers();
    if (!serviceWorkers?.[0]) {
      console.error('No background page available to reload the extension.');
      return;
    }

    // Reload the extension
    await serviceWorkers[0].evaluate(() => {
      chrome.runtime.reload();
    });

    await delay(500);
    await openPopup();
  }

  /**
   * Close the browser context.
   *
   * @returns Promise that resolves when the browser context is closed
   */
  async function closeBrowserContext(): Promise<void> {
    if (state.browserContext) {
      await state.browserContext.close();
      state.browserContext = null;
      state.popupPage = null;
      state.extensionId = null;
    }
  }
}
