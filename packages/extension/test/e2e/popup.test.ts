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

  test('should load popup with kernel panel', async () => {
    // Wait for the panel to be loaded
    await popupPage.waitForSelector('.kernel-panel');

    // Check if the kernel status section is present
    const statusHeading = await popupPage.textContent('.kernel-status h3');
    expect(statusHeading).toBe('Kernel Status');

    // Verify other key elements are present
    await expect(popupPage.locator('#new-vat-name')).toBeVisible();
    await expect(popupPage.locator('#launch-vat')).toBeVisible();
    await expect(popupPage.locator('#vat-dropdown')).toBeVisible();
  });

  test('should handle vat launch controls', async () => {
    // Initially launch button should be disabled
    await expect(popupPage.locator('#launch-vat')).toBeDisabled();

    // Fill in valid vat name and bundle URL
    await popupPage.fill('#new-vat-name', 'test-vat');
    await popupPage.fill('#bundle-url', 'http://localhost:3000/test.bundle');

    // Launch button should be enabled with valid inputs
    await expect(popupPage.locator('#launch-vat')).toBeEnabled();
  });

  test('should handle vat selection controls', async () => {
    // Initially restart and terminate buttons should be disabled
    await expect(popupPage.locator('#restart-vat')).toBeDisabled();
    await expect(popupPage.locator('#terminate-vat')).toBeDisabled();

    // Select a vat from dropdown
    await popupPage.selectOption('#vat-dropdown', 'v1');

    // Buttons should be enabled when vat is selected
    await expect(popupPage.locator('#restart-vat')).toBeEnabled();
    await expect(popupPage.locator('#terminate-vat')).toBeEnabled();
  });

  test('should display kernel status updates', async () => {
    // Wait for status display
    const statusDisplay = await popupPage.waitForSelector('#status-display');

    // Check initial status
    const status = await statusDisplay.textContent();
    expect(status).toMatch(/Active Vats \(\d+\):/u);
  });

  test('should validate bundle URL format', async () => {
    // Clear previous inputs
    await popupPage.fill('#new-vat-name', '');
    await popupPage.fill('#bundle-url', '');

    // Test invalid URL
    await popupPage.fill('#new-vat-name', 'test-vat');
    await popupPage.fill('#bundle-url', 'invalid-url');
    await expect(popupPage.locator('#launch-vat')).toBeDisabled();

    // Test valid URL but wrong extension
    await popupPage.fill('#bundle-url', 'http://localhost:3000/test.js');
    await expect(popupPage.locator('#launch-vat')).toBeDisabled();

    // Test valid bundle URL
    await popupPage.fill('#bundle-url', 'http://localhost:3000/test.bundle');
    await expect(popupPage.locator('#launch-vat')).toBeEnabled();
  });

  test('should handle empty vat list', async () => {
    // When no vats are present
    await popupPage.selectOption('#vat-dropdown', '');

    // Control buttons should be disabled
    await expect(popupPage.locator('#restart-vat')).toBeDisabled();
    await expect(popupPage.locator('#terminate-vat')).toBeDisabled();
  });
});
