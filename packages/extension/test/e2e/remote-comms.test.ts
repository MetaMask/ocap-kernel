import { startRelay } from '@ocap/cli/relay';
import { test, expect } from '@playwright/test';
import type { Page, BrowserContext } from '@playwright/test';
import { rm } from 'node:fs/promises';

import { loadExtension, sessionPath } from '../helpers.ts';

test.describe.configure({ mode: 'serial', timeout: 60_000 });

/**
 * End-to-end tests for remote communications functionality.
 *
 * These tests simulate two independent kernels running in separate browser contexts
 * to test the remote communications features that enable kernels to communicate
 * over the network via libp2p.
 *
 * Key differences from regular kernel tests:
 * - Uses two separate browser extension instances with different user data directories
 * - Each kernel has its own peer identity and storage
 * - Tests actual network communication patterns
 */
test.describe('Remote Communications', () => {
  let extensionContext1: BrowserContext;
  let extensionContext2: BrowserContext;
  let popupPage1: Page;
  let popupPage2: Page;
  let offscreenPage1: Page | null = null;
  let offscreenPage2: Page | null = null;

  test.beforeAll(async () => {
    // Clean up any existing test data
    await rm(sessionPath, { recursive: true, force: true });
    // Start the relay
    await startRelay(console);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  test.beforeEach(async () => {
    // Create two independent extension instances with separate contexts to simulate separate kernels
    const extension1 = await loadExtension('kernel1');
    const extension2 = await loadExtension('kernel2');

    extensionContext1 = extension1.browserContext;
    extensionContext2 = extension2.browserContext;
    popupPage1 = extension1.popupPage;
    popupPage2 = extension2.popupPage;

    // Wait a bit for offscreen documents to be created
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Navigate directly to the offscreen documents to capture their logs
    try {
      offscreenPage1 = await extensionContext1.newPage();
      await offscreenPage1.goto(
        `chrome-extension://${extension1.extensionId}/offscreen.html`,
      );

      // Attach console listener to offscreen page 1
      offscreenPage1.on('console', (message) => {
        console.log(`[Kernel1-OFFSCREEN] ${message.type()}: ${message.text()}`);
      });
      offscreenPage1.on('pageerror', (error) => {
        console.error('[Kernel1-OFFSCREEN Error]', error);
      });

      console.log('Successfully connected to Kernel1 offscreen document');
    } catch (error) {
      console.log('Could not connect to Kernel1 offscreen document:', error);
    }

    try {
      offscreenPage2 = await extensionContext2.newPage();
      await offscreenPage2.goto(
        `chrome-extension://${extension2.extensionId}/offscreen.html`,
      );

      // Attach console listener to offscreen page 2
      offscreenPage2.on('console', (message) => {
        console.log(`[Kernel2-OFFSCREEN] ${message.type()}: ${message.text()}`);
      });
      offscreenPage2.on('pageerror', (error) => {
        console.error('[Kernel2-OFFSCREEN Error]', error);
      });

      console.log('Successfully connected to Kernel2 offscreen document');
    } catch (error) {
      console.log('Could not connect to Kernel2 offscreen document:', error);
    }

    // Also inject console interceptors into the offscreen context via evaluate
    if (offscreenPage1) {
      await offscreenPage1.evaluate(() => {
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;
        const originalInfo = console.info;
        const originalDebug = console.debug;

        console.log = (...args) => {
          originalLog('[OffscreenInternal1]', ...args);
        };
        console.error = (...args) => {
          originalError('[OffscreenInternal1-ERROR]', ...args);
        };
        console.warn = (...args) => {
          originalWarn('[OffscreenInternal1-WARN]', ...args);
        };
        console.info = (...args) => {
          originalInfo('[OffscreenInternal1-INFO]', ...args);
        };
        console.debug = (...args) => {
          originalDebug('[OffscreenInternal1-DEBUG]', ...args);
        };
      });
    }

    if (offscreenPage2) {
      await offscreenPage2.evaluate(() => {
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;
        const originalInfo = console.info;
        const originalDebug = console.debug;

        console.log = (...args) => {
          originalLog('[OffscreenInternal2]', ...args);
        };
        console.error = (...args) => {
          originalError('[OffscreenInternal2-ERROR]', ...args);
        };
        console.warn = (...args) => {
          originalWarn('[OffscreenInternal2-WARN]', ...args);
        };
        console.info = (...args) => {
          originalInfo('[OffscreenInternal2-INFO]', ...args);
        };
        console.debug = (...args) => {
          originalDebug('[OffscreenInternal2-DEBUG]', ...args);
        };
      });
    }

    // Wait for both kernels to be fully loaded
    await expect(
      popupPage1.locator('text=Subcluster s1 - 3 Vats'),
    ).toBeVisible();
    await expect(
      popupPage2.locator('text=Subcluster s1 - 3 Vats'),
    ).toBeVisible();
  });

  test.afterEach(async () => {
    await extensionContext1.close();
    await extensionContext2.close();
  });

  /**
   * Helper function to get peer ID from Remote Comms tab.
   *
   * @param popupPage - The popup page for the kernel instance.
   * @returns The peer ID displayed in the UI.
   */
  async function getPeerIdFromUI(popupPage: Page): Promise<string> {
    await popupPage.click('button:text("Remote Comms")');
    await expect(
      popupPage.locator('[data-testid="peer-id-display"]'),
    ).toBeVisible();

    const peerIdElement = popupPage.locator('[data-testid="peer-id-display"]');
    const peerId = await peerIdElement.inputValue(); // Use inputValue for input elements

    if (!peerId) {
      throw new Error('Peer ID not found in UI');
    }

    return peerId.trim();
  }

  test('should connect two kernels and send remote message', async () => {
    // Get peer IDs from both kernels via Remote Comms tab
    const peerId1 = await getPeerIdFromUI(popupPage1);
    const peerId2 = await getPeerIdFromUI(popupPage2);

    // Verify kernels have different peer IDs (proving they're independent)
    expect(peerId1).toBeTruthy();
    expect(peerId2).toBeTruthy();
    expect(peerId1).not.toBe(peerId2);

    // Get an ocap URL from kernel2's Remote Comms tab
    await popupPage2.click('button:text("Remote Comms")');

    // Wait for the exported URLs to be scanned and displayed
    await expect(popupPage2.locator('text=Exported Object URLs')).toBeVisible({
      timeout: 10000,
    });

    // Get the first exported ocap URL (should be the bob vat from bootstrap)
    const firstOcapUrlInput = popupPage2
      .locator('[data-testid^="ocap-url-"]')
      .first();
    await expect(firstOcapUrlInput).toBeVisible();
    const ocapUrl = await firstOcapUrlInput.inputValue();

    expect(ocapUrl).toMatch(/^ocap:/u);
    expect(ocapUrl).toContain(peerId2); // Should contain kernel2's peer ID

    // focus on kernel1
    await popupPage1.bringToFront();

    // Go to Object Registry tab on kernel1 to send the remote message
    await popupPage1.click('button:text("Object Registry")');

    // Select the first target (alice vat)
    const targetSelect = popupPage1.locator('[data-testid="message-target"]');
    await expect(targetSelect).toBeVisible();
    const options = await targetSelect.locator('option').all();
    expect(options.length).toBeGreaterThan(1);
    await targetSelect.selectOption({ value: 'ko3' });
    expect(await targetSelect.inputValue()).toBe('ko3');

    // Set method to doRunRun (the remote communication method)
    const methodInput = popupPage1.locator('[data-testid="message-method"]');
    await methodInput.fill('doRunRun');

    // Set params to the ocap URL from kernel2
    const paramsInput = popupPage1.locator('[data-testid="message-params"]');
    await paramsInput.fill(`["${ocapUrl}"]`);

    await popupPage1.waitForTimeout(1000);

    const sendButton = popupPage1.locator(
      '[data-testid="message-send-button"]',
    );
    await expect(sendButton).toBeVisible();

    console.log('=== SENDING REMOTE MESSAGE ===');
    console.log(`Target: ko3 (alice vat)`);
    console.log(`Method: doRunRun`);
    console.log(`Params: ["${ocapUrl}"]`);
    console.log('Clicking send button...');

    await sendButton.click();

    console.log('Send button clicked, waiting for response...');

    const messageResponse = popupPage1.locator(
      '[data-testid="message-response"]',
    );
    await expect(messageResponse).toBeVisible({ timeout: 30000 });

    // Log the actual response to help debug CI failures
    const responseText = await messageResponse.textContent();
    console.log('=== ACTUAL RESPONSE ===');
    console.log(responseText);
    console.log('=== END RESPONSE ===');

    await expect(messageResponse).toContainText(
      // eslint-disable-next-line no-useless-escape
      `Response:{\"body\":\"#\\\"vat Bob got \\\\\\\"hello\\\\\\\" from remote Alice\\\"\",\"slots\":[]}`,
    );
  });
});
