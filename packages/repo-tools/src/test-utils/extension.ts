import { chromium, test } from '@playwright/test';
import type { BrowserContext, ConsoleMessage, Page } from '@playwright/test';
import { appendFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const sessionPath = path.resolve(os.tmpdir(), 'ocap-test');

// Run ID is generated once per Playwright invocation (per worker process)
// This allows associating all test log files from the same run
const runId = new Date()
  .toISOString()
  .slice(0, -5) // Remove ".123Z"
  .replace(/[:.]/gu, '-'); // Make filename-safe

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
 * @returns The extension context, extension ID, popup page, and log file path
 */
export const makeLoadExtension = async ({
  contextId,
  extensionPath,
  onPageLoad = async () => Promise.resolve(),
}: Options): Promise<{
  browserContext: BrowserContext;
  extensionId: string;
  popupPage: Page;
  logFilePath: string;
}> => {
  const workerIndex = process.env.TEST_WORKER_INDEX ?? '0';
  // Use provided contextId or fall back to workerIndex for separate user data dirs
  const effectiveContextId = contextId ?? workerIndex;
  const userDataDir = path.join(sessionPath, effectiveContextId);
  await rm(userDataDir, { recursive: true, force: true });

  // Set up log file for capturing console output from extension contexts
  const packageRoot = path.dirname(extensionPath); // extensionPath is <package>/dist
  const logsDir = path.join(packageRoot, 'logs');
  await mkdir(logsDir, { recursive: true });
  const testTitle = test
    .info()
    .titlePath.join('-')
    .replace(/[^a-zA-Z0-9-]/gu, '_'); // Make filename-safe
  const logFilePath = path.join(logsDir, `${runId}-${testTitle}.log`);

  // Attach log file path to test results (viewable in Playwright HTML report)
  await test.info().attach('console-logs', {
    body: logFilePath,
    contentType: 'text/plain',
  });

  const writeLog = (source: string, consoleMessage: ConsoleMessage): void => {
    const logTimestamp = new Date().toISOString().slice(0, -5);
    const text = consoleMessage.text();
    const type = consoleMessage.type();
    // eslint-disable-next-line n/no-sync
    appendFileSync(
      logFilePath,
      `[${logTimestamp}] [${source}] [${type}] ${text}\n`,
    );
  };

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

  // Capture background service worker console logs
  browserContext.on('serviceworker', (worker) => {
    worker.on('console', (consoleMessage) =>
      writeLog('background', consoleMessage),
    );
  });

  // Capture console logs from extension pages (offscreen document, etc.)
  // Note: Pages may start at about:blank, so we attach the listener and check URL in the handler
  browserContext.on('page', (page) => {
    page.on('console', (consoleMessage) => {
      if (page.url().includes('offscreen.html')) {
        writeLog('offscreen', consoleMessage);
      }
    });
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
  popupPage.on('console', (consoleMessage) =>
    writeLog('popup', consoleMessage),
  );
  await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
  await onPageLoad(popupPage);

  return { browserContext, extensionId, popupPage, logFilePath };
};
