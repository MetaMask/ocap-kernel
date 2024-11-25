import { test, expect } from '@playwright/test';

import { createExtension } from '../helpers/extension';

test.describe('Extension Popup', () => {
  test('should load popup with kernel panel', async () => {
    // Create and setup the extension
    const { popupPage } = await createExtension();
    debugger;
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
