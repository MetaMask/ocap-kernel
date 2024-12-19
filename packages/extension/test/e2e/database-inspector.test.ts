import { test, expect } from '@playwright/test';
import type { Page, BrowserContext } from '@playwright/test';

import { makeLoadExtension } from '../helpers/extension';

test.describe('Database Inspector', () => {
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
    await popupPage.click('button:text("Database Inspector")');
    await expect(popupPage.locator('h3:text("DB Tables")')).toBeVisible();
  });

  test('should display database inspector with kv table', async () => {
    const tableSelect = popupPage.locator('select.select');
    await expect(tableSelect).toBeVisible();
    await expect(tableSelect).toHaveValue('kv');

    const expectedKeys = [
      'queue.run.head',
      'queue.run.tail',
      'nextVatId',
      'nextRemoteId',
      'nextObjectId',
      'nextPromiseId',
    ];

    const table = popupPage.locator('table.queryResults');
    await expect(table).toBeVisible();

    for (const key of expectedKeys) {
      await expect(table).toContainText(key);
    }
  });

  test('should refresh table data', async () => {
    await popupPage.click('button:text("Refresh")');
    const table = popupPage.locator('table.queryResults');
    await expect(table).toBeVisible();
    await expect(table).toContainText('nextVatId');
  });

  test('should execute SQL query and show results', async () => {
    await popupPage.fill(
      'input[placeholder="Enter SQL query..."]',
      "SELECT value FROM kv WHERE key = 'nextVatId'",
    );
    await popupPage.click('button:text("Execute Query")');
    const queryResults = popupPage.locator('table.queryResults');
    await expect(queryResults).toBeVisible();
    const resultCell = queryResults.locator('td').first();
    await expect(resultCell).toHaveText('1');
  });

  test('should handle invalid SQL queries', async () => {
    await popupPage.fill(
      'input[placeholder="Enter SQL query..."]',
      'INVALID SQL QUERY',
    );
    await popupPage.click('button:text("Execute Query")');
    const errorMessage = popupPage.locator('.error');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText('Failed to execute query');
  });
});
