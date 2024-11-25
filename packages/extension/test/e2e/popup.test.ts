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
});
