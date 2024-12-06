import { test, expect } from '@playwright/test';
import type { Page, BrowserContext } from '@playwright/test';

import { makeLoadExtension } from '../helpers/extension';

test.describe('Kernel Panel', () => {
  let extensionContext: BrowserContext;
  let popupPage: Page;

  test.beforeAll(async () => {
    const extension = await makeLoadExtension();
    extensionContext = extension.browserContext;
    popupPage = extension.popupPage;
  });

  test.afterAll(async () => {
    await extensionContext.close();
  });

  test.beforeEach(async () => {
    await popupPage.waitForSelector('.kernel-panel');
    await popupPage.click('#clear-state');
    await popupPage.fill('#new-vat-name', '');
    await popupPage.fill('#bundle-url', '');
    await popupPage.selectOption('#vat-dropdown', '');
  });

  /**
   * Launches a vat with the given name and bundle URL.
   *
   * @param name - The name of the vat to launch.
   */
  async function launchVat(name: string = 'test-vat'): Promise<void> {
    await popupPage.fill('#new-vat-name', name);
    await popupPage.fill(
      '#bundle-url',
      'http://localhost:3000/sample-vat.bundle',
    );
    await popupPage.click('#launch-vat');
  }

  test('should load popup with kernel panel', async () => {
    const statusHeading = await popupPage.textContent('.kernel-status h3');
    expect(statusHeading).toBe('Kernel Status');
    const statusDisplay = await popupPage.waitForSelector('#status-display');
    const status = await statusDisplay.textContent();
    expect(status).toMatch(/Active Vats \(\d+\):/u);
    await expect(popupPage.locator('#new-vat-name')).toBeVisible();
    await expect(popupPage.locator('#launch-vat')).toBeVisible();
    await expect(popupPage.locator('#vat-dropdown')).toBeVisible();
    await expect(popupPage.locator('#restart-vat')).toBeVisible();
    await expect(popupPage.locator('#terminate-vat')).toBeVisible();
    await expect(popupPage.locator('#terminate-all')).toBeVisible();
  });

  test('should validate bundle URL format', async () => {
    await popupPage.fill('#new-vat-name', 'test-vat');
    await popupPage.fill('#bundle-url', 'invalid-url');
    await expect(popupPage.locator('#launch-vat')).toBeDisabled();
    await popupPage.fill('#bundle-url', 'http://localhost:3000/test.js');
    await expect(popupPage.locator('#launch-vat')).toBeDisabled();
    await popupPage.fill(
      '#bundle-url',
      'http://localhost:3000/sample-vat.bundle',
    );
    await expect(popupPage.locator('#launch-vat')).toBeEnabled();
  });

  test('should handle vat buttons state', async () => {
    await popupPage.selectOption('#vat-dropdown', '');
    await expect(popupPage.locator('#restart-vat')).toBeDisabled();
    await expect(popupPage.locator('#terminate-vat')).toBeDisabled();
    await popupPage.selectOption('#vat-dropdown', 'v1');
    await expect(popupPage.locator('#restart-vat')).toBeEnabled();
    await expect(popupPage.locator('#terminate-vat')).toBeEnabled();
  });

  test('should launch a new vat', async () => {
    await launchVat();
    await expect(popupPage.locator('#status-display')).toContainText(
      'Active Vats (1)',
    );
    await expect(popupPage.locator('#vat-dropdown')).toContainText('v1');
  });

  test('should restart a vat', async () => {
    await expect(popupPage.locator('#restart-vat')).toBeDisabled();
    await popupPage.selectOption('#vat-dropdown', 'v1');
    await expect(popupPage.locator('#restart-vat')).toBeEnabled();
    await expect(popupPage.locator('#status-display')).toContainText('["v1"');
    await popupPage.click('#restart-vat');
    await expect(popupPage.locator('#status-display')).toContainText('"v1"]');
  });

  test('should terminate a vat', async () => {
    await launchVat();
    await expect(popupPage.locator('#terminate-vat')).toBeDisabled();
    await popupPage.selectOption('#vat-dropdown', 'v1');
    await expect(popupPage.locator('#terminate-vat')).toBeEnabled();
    await popupPage.click('#terminate-vat');
    await expect(popupPage.locator('#status-display')).toContainText(
      'Active Vats (0)',
    );
  });

  test('should send a message to a vat', async () => {
    await launchVat();
    await expect(popupPage.locator('#send-message')).toBeDisabled();
    await popupPage.fill('#message-content', '{"method":"ping","params":null}');
    await expect(popupPage.locator('#send-message')).toBeEnabled();
    await popupPage.click('#send-message');
    await expect(popupPage.locator('#message-output')).toContainText(
      'Vat ID required for this command',
    );
    await popupPage.selectOption('#vat-dropdown', 'v1');
    await popupPage.click('#send-message');
    await expect(popupPage.locator('#message-output')).toContainText('pong');
  });

  test('should terminate all vats', async () => {
    await launchVat();
    await expect(popupPage.locator('#status-display')).toContainText(
      'Active Vats (1): ["v1"]',
    );
    await popupPage.click('#terminate-all');
    await expect(popupPage.locator('#status-display')).toContainText(
      'Active Vats (0)',
    );
  });

  test('should clear kernel state', async () => {
    await launchVat('test-vat-1');
    await launchVat('test-vat-2');
    await expect(popupPage.locator('#status-display')).toContainText(
      'Active Vats (2): ["v1","v2"]',
    );
    await popupPage.click('#clear-state');
    await expect(popupPage.locator('#status-display')).toContainText(
      'Active Vats (0)',
    );
    await launchVat('test-vat-new');
    await expect(popupPage.locator('#vat-dropdown')).toContainText('v1');
    await expect(popupPage.locator('#status-display')).toContainText(
      'Active Vats (1): ["v1"]',
    );
  });
});
