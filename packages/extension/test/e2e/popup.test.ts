import { test, expect } from '@playwright/test';
import type { Page, BrowserContext } from '@playwright/test';

import clusterConfig from '../../src/vats/default-cluster.json' assert { type: 'json' };
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
    await popupPage.waitForSelector('h2:text("Kernel Vats")');
    await popupPage.click('button:text("Clear All State")');
    await popupPage.fill('input[placeholder="Vat Name"]', '');
    await popupPage.fill('input[placeholder="Bundle URL"]', '');
    await expect(popupPage.locator('#root')).toContainText('State cleared');
  });

  /**
   * Launches a vat with the given name and bundle URL.
   *
   * @param name - The name of the vat to launch.
   */
  async function launchVat(name: string = 'test-vat'): Promise<void> {
    await popupPage.fill('input[placeholder="Vat Name"]', name);
    await popupPage.fill(
      'input[placeholder="Bundle URL"]',
      'http://localhost:3000/sample-vat.bundle',
    );
    await popupPage.click('button:text("Launch Vat")');
    await expect(popupPage.locator('#root')).toContainText(
      `Launched vat "${name}"`,
    );
  }

  test('should load popup with kernel panel', async () => {
    await expect(popupPage.locator('h2')).toHaveText('Kernel Vats');
    await expect(
      popupPage.locator('button:text("Clear All State")'),
    ).toBeVisible();
    await expect(
      popupPage.locator('input[placeholder="Vat Name"]'),
    ).toBeVisible();
    await expect(
      popupPage.locator('input[placeholder="Bundle URL"]'),
    ).toBeVisible();
    await expect(popupPage.locator('button:text("Launch Vat")')).toBeVisible();
  });

  test('should validate bundle URL format', async () => {
    await popupPage.fill('input[placeholder="Vat Name"]', 'test-vat');
    await popupPage.fill('input[placeholder="Bundle URL"]', 'invalid-url');
    await expect(popupPage.locator('button:text("Launch Vat")')).toBeDisabled();

    await popupPage.fill(
      'input[placeholder="Bundle URL"]',
      'http://localhost:3000/test.js',
    );
    await expect(popupPage.locator('button:text("Launch Vat")')).toBeDisabled();

    await popupPage.fill(
      'input[placeholder="Bundle URL"]',
      'http://localhost:3000/sample-vat.bundle',
    );
    await expect(popupPage.locator('button:text("Launch Vat")')).toBeEnabled();
  });

  test('should launch a new vat', async () => {
    await launchVat();
    const vatTable = popupPage.locator('table');
    await expect(vatTable).toBeVisible();
    await expect(vatTable.locator('tr')).toHaveCount(2); // Header + 1 row
  });

  test('should restart a vat', async () => {
    await launchVat();
    await expect(popupPage.locator('button:text("Restart")')).toBeVisible();
    await popupPage.click('button:text("Restart")');
    await expect(popupPage.locator('#root')).toContainText(
      'Restarted vat "v1"',
    );
  });

  test('should terminate a vat', async () => {
    await launchVat();
    await expect(
      popupPage.locator('td button:text("Terminate")'),
    ).toBeVisible();
    await popupPage.click('td button:text("Terminate")');
    await expect(popupPage.locator('#root')).toContainText(
      'Terminated vat "v1"',
    );
    await expect(popupPage.locator('table')).not.toBeVisible();
  });

  test('should send a message to a vat', async () => {
    await launchVat();
    await expect(popupPage.locator('td button:text("Ping")')).toBeVisible();
    await popupPage.click('td button:text("Ping")');
    await expect(popupPage.locator('#root')).toContainText('"method": "ping",');
    await expect(popupPage.locator('#root')).toContainText('{"result":"pong"}');
  });

  test('should terminate all vats', async () => {
    await launchVat();
    await expect(
      popupPage.locator('button:text("Terminate All Vats")'),
    ).toBeVisible();
    await popupPage.click('button:text("Terminate All Vats")');
    await expect(popupPage.locator('#root')).toContainText(
      'All vats terminated',
    );
    await expect(popupPage.locator('table')).not.toBeVisible();
  });

  test('should clear kernel state', async () => {
    await launchVat('test-vat-1');
    await launchVat('test-vat-2');
    await expect(popupPage.locator('table tr')).toHaveCount(3); // Header + 2 rows
    await popupPage.click('button:text("Clear All State")');
    await expect(popupPage.locator('table')).not.toBeVisible();
    await launchVat('test-vat-new');
    await expect(popupPage.locator('table tr')).toHaveCount(2); // Header + 1 row
  });

  test('should reload kernel state and load default vats', async () => {
    await expect(
      popupPage.locator('button:text("Reload Kernel")'),
    ).toBeVisible();
    await popupPage.click('button:text("Reload Kernel")');
    await expect(popupPage.locator('#root')).toContainText(
      'Default sub-cluster reloaded',
    );
    // Verify the table is visible and has the correct number of rows (header + vats)
    const vatTable = popupPage.locator('[data-testid="vat-table"]');
    await expect(vatTable).toBeVisible();
    await expect(vatTable.locator('tr')).toHaveCount(
      Object.keys(clusterConfig.vats).length + 1, // +1 for header row
    );
    // Verify each default vat is present in the table
    for (const [, vatConfig] of Object.entries(clusterConfig.vats)) {
      await expect(vatTable).toContainText(vatConfig.parameters.name);
      await expect(vatTable).toContainText(vatConfig.bundleSpec);
    }
  });

  test('should handle cluster configuration updates', async () => {
    // Check initial config is visible and matches clusterConfig
    const configTextarea = popupPage.locator('[data-testid="config-textarea"]');
    await expect(configTextarea).toBeVisible();
    await expect(configTextarea).toHaveValue(
      JSON.stringify(clusterConfig, null, 2),
    );
    // Test invalid JSON handling
    await configTextarea.fill('{ invalid json }');
    await popupPage.click('button:text("Update Config")');
    await expect(popupPage.locator('#root')).toContainText('SyntaxError');
    // Verify original vats still exist
    const vatTable = popupPage.locator('[data-testid="vat-table"]');
    const firstVatKey = Object.keys(
      clusterConfig.vats,
    )[0] as keyof typeof clusterConfig.vats;
    const originalVatName = clusterConfig.vats[firstVatKey].parameters.name;
    await expect(vatTable).toContainText(originalVatName);
    // Modify config with new vat name
    const modifiedConfig = structuredClone(clusterConfig);
    modifiedConfig.vats[firstVatKey].parameters.name = 'SuperAlice';
    // Update config and reload
    await configTextarea.fill(JSON.stringify(modifiedConfig, null, 2));
    await popupPage.click('button:text("Update Config")');
    await popupPage.click('button:text("Reload Kernel")');
    // Verify new vat name appears
    await expect(vatTable).toContainText('SuperAlice');
  });
});
