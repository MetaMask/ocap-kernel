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
    await popupPage.waitForSelector('h2:text("Kernel Vats")');
    await popupPage.click('button:text("Clear All State")');
    await expect(popupPage.locator('#root')).toContainText('State cleared');
  });

  test.afterAll(async () => {
    await extensionContext.close();
  });

  test.beforeEach(async () => {
    await popupPage.click('button:text("Database Inspector")');
    await expect(popupPage.locator('#root')).toContainText(
      'SELECT name FROM sqlite_master',
    );
  });

  test('should display database inspector with kv table', async () => {
    const tableSelect = popupPage.locator('select');
    await expect(tableSelect).toBeVisible();
    await expect(tableSelect).toHaveValue('kv');
    const table = popupPage.locator('table');
    await expect(table).toBeVisible();
    const rows = table.locator('tr');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(1);
  });

  test('should refresh table data', async () => {
    await popupPage.click('button:text("Refresh")');
    const table = popupPage.locator('table');
    await expect(table).toBeVisible();
    await expect(table).toContainText('nextVatId');
  });

  test('should execute SQL query and show results', async () => {
    await popupPage.fill(
      'input[placeholder="Enter SQL query..."]',
      "SELECT value FROM kv WHERE key = 'nextVatId'",
    );
    await popupPage.click('button:text("Execute Query")');
    const queryResults = popupPage.locator('table');
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
    await expect(popupPage.locator('#root')).toContainText(
      'Failed to execute query',
    );
  });
});
