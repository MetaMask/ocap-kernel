import { test, expect } from '@playwright/test';
import type { Page, BrowserContext } from '@playwright/test';

import minimalClusterConfig from '../../src/vats/minimal-cluster.json' assert { type: 'json' };
import { makeLoadExtension } from '../helpers/extension.ts';

test.describe.configure({ mode: 'serial' });

test.describe('Control Panel', () => {
  let extensionContext: BrowserContext;
  let popupPage: Page;

  test.beforeEach(async () => {
    const extension = await makeLoadExtension();
    extensionContext = extension.browserContext;
    popupPage = extension.popupPage;
    await expect(
      popupPage.locator('[data-testid="subcluster-accordion-s1"]'),
    ).toBeVisible();
  });

  test.afterEach(async () => {
    await extensionContext.close();
  });

  /**
   * Clears the state of the popup page.
   */
  async function clearState(): Promise<void> {
    await popupPage.locator('[data-testid="clear-logs-button"]').click();
    await expect(
      popupPage.locator('[data-testid="message-output"]'),
    ).toContainText('');
    await popupPage.click('button:text("Clear All State")');
    await expect(
      popupPage.locator('[data-testid="message-output"]'),
    ).toContainText('State cleared');
    await expect(
      popupPage.locator('[data-testid="subcluster-accordion-s1"]'),
    ).not.toBeVisible();
  }

  /**
   * Launches a subcluster with the given configuration.
   *
   * @param config - The cluster configuration object to use for launching the subcluster.
   */
  async function launchSubcluster(config: object): Promise<void> {
    const fileInput = popupPage.locator(
      '[data-testid="subcluster-config-input"]',
    );
    const fileContent = JSON.stringify(config);
    await fileInput.setInputFiles({
      name: 'config.json',
      mimeType: 'application/json',
      buffer: Buffer.from(fileContent),
    });
    await expect(
      popupPage.locator('[data-testid="message-output"]'),
    ).toContainText('Subcluster launched');
  }

  test('should load popup with kernel panel', async () => {
    await expect(popupPage.locator('h2')).toHaveText('Kernel');
    await expect(
      popupPage.locator('button:text("Clear All State")'),
    ).toBeVisible();
    await expect(
      popupPage.locator('h4:text("Launch New Subcluster")'),
    ).toBeVisible();
  });

  test('should launch a new subcluster and vat within it', async () => {
    await clearState();
    await launchSubcluster(minimalClusterConfig);
    const subcluster = popupPage.locator(
      '[data-testid="subcluster-accordion-s1"]',
    );
    await expect(subcluster).toBeVisible({
      timeout: 2000,
    });
    await expect(popupPage.locator('text=1 Vat')).toBeVisible();
    // Open the subcluster accordion to view vats
    await popupPage.locator('.accordion-header').first().click();
    const vatTable = popupPage.locator('[data-testid="vat-table"]');
    await expect(vatTable).toBeVisible();
    await expect(vatTable.locator('tr')).toHaveCount(2);
  });

  test('should restart a vat within subcluster', async () => {
    // Open the subcluster accordion first
    await popupPage.locator('.accordion-header').first().click();
    await expect(
      popupPage.locator('button:text("Restart")').first(),
    ).toBeVisible();
    await popupPage.locator('button:text("Restart")').first().click();
    await expect(
      popupPage.locator('[data-testid="message-output"]'),
    ).toContainText('Restarted vat');
  });

  test('should terminate a vat within subcluster', async () => {
    // Open the subcluster accordion first
    await popupPage.locator('.accordion-header').first().click();
    await expect(
      popupPage.locator('td button:text("Terminate")').first(),
    ).toBeVisible();
    await popupPage.locator('td button:text("Terminate")').first().click();
    await expect(
      popupPage.locator('[data-testid="message-output"]'),
    ).toContainText('Terminated vat');
  });

  test('should ping a vat within subcluster', async () => {
    // Open the subcluster accordion first
    await popupPage.locator('.accordion-header').first().click();
    await expect(
      popupPage.locator('td button:text("Ping")').first(),
    ).toBeVisible();
    await popupPage.locator('td button:text("Ping")').first().click();
    await expect(
      popupPage.locator('[data-testid="message-output"]'),
    ).toContainText('"method": "pingVat",');
    await expect(
      popupPage.locator('[data-testid="message-output"]'),
    ).toContainText('pong');
  });

  test('should terminate a subcluster', async () => {
    // Open the subcluster accordion first
    await popupPage.locator('.accordion-header').first().click();
    await expect(
      popupPage.locator('button:text("Terminate Subcluster")').first(),
    ).toBeVisible();
    await popupPage
      .locator('button:text("Terminate Subcluster")')
      .first()
      .click();
    await expect(
      popupPage.locator('[data-testid="message-output"]'),
    ).toContainText('Terminated subcluster');
  });

  test('should reload a subcluster', async () => {
    // Open the subcluster accordion first
    await popupPage.locator('.accordion-header').first().click();
    await expect(
      popupPage.locator('button:text("Reload Subcluster")').first(),
    ).toBeVisible();
    await popupPage.locator('button:text("Reload Subcluster")').first().click();
    await expect(
      popupPage.locator('[data-testid="message-output"]'),
    ).toContainText('Reloaded subcluster');
  });

  test('should terminate all vats', async () => {
    await expect(
      popupPage.locator('button:text("Terminate All Vats")'),
    ).toBeVisible();
    await popupPage.click('button:text("Terminate All Vats")');
    await expect(
      popupPage.locator('[data-testid="message-output"]'),
    ).toContainText('All vats terminated');
    await expect(popupPage.locator('table')).not.toBeVisible();
  });

  test('should clear kernel state', async () => {
    await popupPage.click('button:text("Clear All State")');
    await expect(
      popupPage.locator('[data-testid="message-output"]'),
    ).toContainText('State cleared');
    await expect(popupPage.locator('table')).not.toBeVisible();
  });

  test('should reload kernel state and load default vats', async () => {
    test.slow();
    await expect(
      popupPage.locator('button:text("Reload Kernel")'),
    ).toBeVisible();
    await popupPage.click('button:text("Reload Kernel")');
    await expect(
      popupPage.locator('[data-testid="message-output"]'),
    ).toContainText('"method": "reload"');
    await expect(
      popupPage.locator('[data-testid="message-output"]'),
    ).toContainText('Kernel reloaded', {
      timeout: 10000,
    });
  });

  test('should collect garbage', async () => {
    await expect(
      popupPage.locator('button:text("Database Inspector")'),
    ).toBeVisible();
    await popupPage.click('button:text("Database Inspector")');
    await expect(
      popupPage.locator('[data-testid="message-output"]'),
    ).toContainText('{"key":"vats.terminated","value":"[]"}');
    const v3Values = [
      '{"key":"e.nextPromiseId.v3","value":"2"}',
      '{"key":"e.nextObjectId.v3","value":"1"}',
      '{"key":"ko5.owner","value":"v3"}',
      '{"key":"v3.c.ko5","value":"R o+0"}',
      '{"key":"v3.c.o+0","value":"ko5"}',
      '{"key":"v3.c.kp3","value":"R p-1"}',
      '{"key":"v3.c.p-1","value":"kp3"}',
      '{"key":"ko5.refCount","value":"1,1"}',
    ];
    const v1ko3Values = [
      '{"key":"v1.c.ko4","value":"R o-1"}',
      '{"key":"v1.c.o-1","value":"ko4"}',
      '{"key":"v1.c.ko5","value":"R o-2"}',
      '{"key":"v1.c.o-2","value":"ko5"}',
      '{"key":"kp3.state","value":"fulfilled"}',
      '{"key":"kp3.value","value"',
    ];
    await expect(
      popupPage.locator('[data-testid="message-output"]'),
    ).toContainText('{"key":"kp3.refCount","value":"2"}');
    await expect(
      popupPage.locator('[data-testid="message-output"]'),
    ).toContainText('{"key":"vatConfig.v3","value"');
    for (const value of v3Values) {
      await expect(
        popupPage.locator('[data-testid="message-output"]'),
      ).toContainText(value);
    }
    for (const value of v1ko3Values) {
      await expect(
        popupPage.locator('[data-testid="message-output"]'),
      ).toContainText(value);
    }
    await popupPage.click('button:text("Control Panel")');
    await popupPage.locator('.accordion-header').first().click();
    await popupPage.locator('td button:text("Terminate")').last().click();
    await expect(
      popupPage.locator('[data-testid="message-output"]'),
    ).toContainText('Terminated vat "v3"');
    await popupPage.locator('[data-testid="clear-logs-button"]').click();
    await expect(
      popupPage.locator('[data-testid="message-output"]'),
    ).toContainText('');
    await popupPage.click('button:text("Database Inspector")');
    await expect(
      popupPage.locator('[data-testid="message-output"]'),
    ).toContainText('{"key":"vats.terminated","value":"[\\"v3\\"]"}');
    await expect(
      popupPage.locator('[data-testid="message-output"]'),
    ).not.toContainText('{"key":"vatConfig.v3","value"');
    for (const value of v3Values) {
      await expect(
        popupPage.locator('[data-testid="message-output"]'),
      ).toContainText(value);
    }
    await popupPage.click('button:text("Control Panel")');

    await popupPage.click('button:text("Collect Garbage")');
    await expect(
      popupPage.locator('[data-testid="message-output"]'),
    ).toContainText('Garbage collected');
    await popupPage.locator('[data-testid="clear-logs-button"]').click();
    await expect(
      popupPage.locator('[data-testid="message-output"]'),
    ).toContainText('');
    await popupPage.click('button:text("Database Inspector")');
    // v3 is gone
    for (const value of v3Values) {
      await expect(
        popupPage.locator('[data-testid="message-output"]'),
      ).not.toContainText(value);
    }
    // ko3 reference still exists for v1
    for (const value of v1ko3Values) {
      await expect(
        popupPage.locator('[data-testid="message-output"]'),
      ).toContainText(value);
    }
    // kp3 reference dropped to 1
    await expect(
      popupPage.locator('[data-testid="message-output"]'),
    ).toContainText('{"key":"kp3.refCount","value":"1"}');
    await popupPage.click('button:text("Control Panel")');
    await popupPage.locator('.accordion-header').first().click();
    // delete v1
    await popupPage.locator('td button:text("Terminate")').first().click();
    await expect(
      popupPage.locator('[data-testid="message-output"]'),
    ).toContainText('Terminated vat "v1"');
    await popupPage.click('button:text("Collect Garbage")');
    await expect(
      popupPage.locator('[data-testid="message-output"]'),
    ).toContainText('Garbage collected');
    await popupPage.locator('[data-testid="clear-logs-button"]').click();
    await expect(
      popupPage.locator('[data-testid="message-output"]'),
    ).toContainText('');
    await popupPage.click('button:text("Database Inspector")');
    await expect(
      popupPage.locator('[data-testid="message-output"]'),
    ).toContainText('{"key":"vats.terminated","value":"[]"}');
    for (const value of v1ko3Values) {
      await expect(
        popupPage.locator('[data-testid="message-output"]'),
      ).not.toContainText(value);
    }
  });
});
