import { test, expect } from '@playwright/test';
import type { Page, BrowserContext } from '@playwright/test';

import { loadExtension } from './utils.ts';

test.describe.configure({ mode: 'serial' });

test.describe('Smoke Test', () => {
  let extensionContext: BrowserContext;
  let popupPage: Page;

  test.beforeEach(async () => {
    const extension = await loadExtension();
    extensionContext = extension.browserContext;
    popupPage = extension.popupPage;
  });

  test.afterEach(async () => {
    await extensionContext.close();
  });

  test('should load popup with kernel expected elements', async () => {
    await expect(
      popupPage.locator('div:text("Omnium Gatherum")'),
    ).toBeVisible();
  });
});
