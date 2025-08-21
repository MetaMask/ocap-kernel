import { test, expect } from '@playwright/test';
import type { Page, BrowserContext } from '@playwright/test';

import { makeLoadExtension } from '../helpers/extension.ts';

test.describe.configure({ mode: 'serial' });

test.describe('Kernel Persistence', () => {
  let extensionContext: BrowserContext;
  let popupPage: Page;

  test.beforeEach(async () => {
    const extension = await makeLoadExtension();
    extensionContext = extension.browserContext;
    popupPage = extension.popupPage;
  });

  test.afterEach(async () => {
    await extensionContext.close();
  });

  test('should handle new subclusters after restart', async () => {
    // Launch a new subcluster
    const minimalClusterConfig = {
      name: 'test-persistence',
      vats: {
        testVat: {
          sourceSpec: 'test-vat.js',
          parameters: { name: 'TestVat' },
        },
      },
    };

    const fileInput = popupPage.locator(
      '[data-testid="subcluster-config-input"]',
    );
    const fileContent = JSON.stringify(minimalClusterConfig);
    await fileInput.setInputFiles({
      name: 'config.json',
      mimeType: 'application/json',
      buffer: Buffer.from(fileContent),
    });

    await expect(
      popupPage.locator('[data-testid="message-output"]'),
    ).toContainText('Subcluster launched');

    // Verify new subcluster is visible
    await expect(popupPage.locator('text=Subcluster s2 - 1 Vat')).toBeVisible();

    // Close and restart extension
    await extensionContext.close();
    const newExtension = await makeLoadExtension();
    const newContext = newExtension.browserContext;
    const newPopupPage = newExtension.popupPage;

    // Verify new subcluster is present after restart
    await expect(
      newPopupPage.locator('text=Subcluster s2 - 1 Vat'),
    ).toBeVisible();

    // Clean up
    await newContext.close();
  });
});
