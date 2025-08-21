import { test, expect } from '@playwright/test';
import type { Page, BrowserContext } from '@playwright/test';

import minimalClusterConfig from '../../src/vats/minimal-cluster.json' assert { type: 'json' };
import { makeLoadExtension } from '../helpers/extension.ts';

test.describe.configure({ mode: 'serial' });

test.describe('Kernel Persistence', () => {
  let extensionContext: BrowserContext;
  let extensionId: string;
  let popupPage: Page;

  test.beforeEach(async () => {
    const extension = await makeLoadExtension();
    extensionContext = extension.browserContext;
    extensionId = extension.extensionId;
    popupPage = extension.popupPage;
  });

  test.afterEach(async () => {
    await extensionContext.close();
  });

  test('should handle new subclusters after restart', async () => {
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
    await expect(popupPage.locator('text=Subcluster s2 - 1 Vat')).toBeVisible();
    await popupPage.close();
    const newPopupPage = await extensionContext.newPage();
    await newPopupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(
      newPopupPage.locator('text=Subcluster s1 - 3 Vats'),
    ).toBeVisible();
    await expect(
      newPopupPage.locator('text=Subcluster s2 - 1 Vat'),
    ).toBeVisible();
    await newPopupPage.close();
    const extensionsPage = await extensionContext.newPage();
    await extensionsPage.goto(`chrome://extensions/?id=${extensionId}`);
    const devModeToggle = extensionsPage.locator('#devMode');
    await devModeToggle.click();
    const enableToggle = extensionsPage.locator(
      '#enableToggle[aria-describedby="name enable-toggle-tooltip"]',
    );
    await enableToggle.click();
    await enableToggle.click();
    await extensionsPage.waitForTimeout(1000);
    await enableToggle.click();
    const reloadButton = extensionsPage.locator(
      '[class="cr-title-text"] + #dev-reload-button',
    );
    await reloadButton.click();
    await extensionsPage.waitForTimeout(2000);
    await extensionsPage.close();
    const reloadedPopupPage = await extensionContext.newPage();
    await reloadedPopupPage.goto(
      `chrome-extension://${extensionId}/popup.html`,
    );
    await expect(
      reloadedPopupPage.locator('text=Subcluster s1 - 3 Vats'),
    ).toBeVisible();
    await expect(
      reloadedPopupPage.locator('text=Subcluster s2 - 1 Vat'),
    ).toBeVisible();
    await reloadedPopupPage.close();
  });
});
