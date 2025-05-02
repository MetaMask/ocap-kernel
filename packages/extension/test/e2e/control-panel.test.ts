import { test, expect } from '@playwright/test';
import type { Page, BrowserContext, Locator } from '@playwright/test';

// Vitest/Playwright needs the import assertions
import defaultClusterConfig from '../../src/vats/default-cluster.json' assert { type: 'json' };
import minimalClusterConfig from '../../src/vats/minimal-cluster.json' assert { type: 'json' };
import { makeLoadExtension } from '../helpers/extension.ts';

test.describe.configure({ mode: 'serial' });

test.describe('Control Panel', () => {
  let extensionContext: BrowserContext;
  let popupPage: Page;
  let extensionId: string;
  let messageOutput: Locator;

  test.beforeEach(async () => {
    const extension = await makeLoadExtension();
    extensionContext = extension.browserContext;
    popupPage = extension.popupPage;
    extensionId = extension.extensionId;
    messageOutput = popupPage.locator('[data-testid="message-output"]');
    await expect(popupPage.locator('[data-testid="vat-table"]')).toBeVisible();
    await expect(popupPage.locator('table tr')).toHaveCount(4); // Header + 3 rows
  });

  test.afterEach(async () => {
    await extensionContext.close();
  });

  /**
   * Clears the state of the popup page.
   */
  async function clearState(): Promise<void> {
    await popupPage.locator('[data-testid="clear-logs-button"]').click();
    await expect(messageOutput).toContainText('');
    await popupPage.fill('input[placeholder="Vat Name"]', '');
    await popupPage.fill('input[placeholder="Bundle URL"]', '');
    await popupPage.click('button:text("Clear All State")');
    await expect(messageOutput).toContainText('State cleared');
    await expect(
      popupPage.locator('[data-testid="vat-table"]'),
    ).not.toBeVisible();
  }

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
    await expect(messageOutput).toContainText(`Launched vat "${name}"`);
  }

  test('should load popup with kernel panel', async () => {
    await expect(popupPage.locator('h2')).toHaveText('Kernel');
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
    await clearState();
    await launchVat();
    const vatTable = popupPage.locator('table');
    await expect(vatTable).toBeVisible();
    await expect(vatTable.locator('tr')).toHaveCount(2); // Header + 1 row
  });

  test('should restart a vat', async () => {
    await expect(
      popupPage.locator('button:text("Restart")').first(),
    ).toBeVisible();
    await popupPage.locator('button:text("Restart")').first().click();
    await expect(messageOutput).toContainText('Restarted vat "v1"');
  });

  test('should terminate a vat', async () => {
    await expect(popupPage.locator('table tr')).toHaveCount(4);
    await expect(
      popupPage.locator('td button:text("Terminate")').first(),
    ).toBeVisible();
    await popupPage.locator('td button:text("Terminate")').first().click();
    await expect(messageOutput).toContainText('Terminated vat "v1"');
    await expect(popupPage.locator('table tr')).toHaveCount(3);
  });

  // TODO: Fix this test once the ping method is implemented
  test.skip('should ping a vat', async () => {
    await expect(
      popupPage.locator('td button:text("Ping")').first(),
    ).toBeVisible();
    await popupPage.locator('td button:text("Ping")').first().click();
    await expect(messageOutput).toContainText('"method": "ping",');
    await expect(messageOutput).toContainText('{"result":"pong"}');
  });

  test('should terminate all vats', async () => {
    await expect(
      popupPage.locator('button:text("Terminate All Vats")'),
    ).toBeVisible();
    await popupPage.click('button:text("Terminate All Vats")');
    await expect(messageOutput).toContainText('All vats terminated');
    await expect(popupPage.locator('table')).not.toBeVisible();
    // ensure all references were garbage collected
    await popupPage.locator('[data-testid="clear-logs-button"]').click();
    await expect(messageOutput).toContainText('');
    await popupPage.click('button:text("Database Inspector")');
    const expectedValues = JSON.stringify([
      { key: 'queue.run.head', value: '6' },
      { key: 'queue.run.tail', value: '6' },
      { key: 'gcActions', value: '[]' },
      { key: 'reapQueue', value: '[]' },
      { key: 'vats.terminated', value: '[]' },
      { key: 'nextObjectId', value: '4' },
      { key: 'nextPromiseId', value: '4' },
      { key: 'nextVatId', value: '4' },
      { key: 'nextRemoteId', value: '1' },
      { key: 'initialized', value: 'true' },
    ]);
    await expect(messageOutput).toContainText(expectedValues);
  });

  test('should clear kernel state', async () => {
    await popupPage.click('button:text("Clear All State")');
    await expect(messageOutput).toContainText('State cleared');
    await expect(popupPage.locator('table')).not.toBeVisible();
    // ensure kernel state was cleared
    await popupPage.locator('[data-testid="clear-logs-button"]').click();
    await expect(messageOutput).toContainText('');
    await popupPage.click('button:text("Database Inspector")');
    const expectedValues = JSON.stringify([
      { key: 'queue.run.head', value: '1' },
      { key: 'queue.run.tail', value: '1' },
      { key: 'gcActions', value: '[]' },
      { key: 'reapQueue', value: '[]' },
      { key: 'vats.terminated', value: '[]' },
      { key: 'nextObjectId', value: '1' },
      { key: 'nextPromiseId', value: '1' },
      { key: 'nextVatId', value: '1' },
      { key: 'nextRemoteId', value: '1' },
    ]);
    await expect(messageOutput).toContainText(expectedValues);
    await expect(messageOutput).not.toContainText('"initialized":true');
    await popupPage.click('button:text("Control Panel")');
    await launchVat('test-vat-new');
    await expect(popupPage.locator('table tr')).toHaveCount(2);
  });

  test('should initialize vat with correct ID from kernel', async () => {
    await clearState();
    // Open the offscreen page where vat logs appear
    const offscreenPage = await extensionContext.newPage();
    await offscreenPage.goto(
      `chrome-extension://${extensionId}/offscreen.html`,
    );
    // Capture console logs
    const logs: string[] = [];
    offscreenPage.on('console', (message) => logs.push(message.text()));
    // Launch a vat and get its ID from the table
    await launchVat('test-vat');
    const vatId = await popupPage
      .locator('table')
      .locator('tr')
      .nth(1)
      .getAttribute('data-vat-id');
    // Verify the KV store initialization log shows the correct vat ID
    await expect
      .poll(() =>
        logs.some((log) =>
          log.includes(`VatSupervisor initialized with vatId: ${vatId}`),
        ),
      )
      .toBeTruthy();
  });

  test('should send a message to a vat', async () => {
    const clearLogsButton = popupPage.locator(
      '[data-testid="clear-logs-button"]',
    );
    await clearLogsButton.click();
    await popupPage.click('button:text("Object Registry")');
    await expect(popupPage.locator('#root')).toContainText(
      'Alice (v1) - 3 objects, 3 promises',
    );
    const targetSelect = popupPage.locator('[data-testid="message-target"]');
    await expect(targetSelect).toBeVisible();
    const options = targetSelect.locator('option:not([value=""])');
    await expect(options).toHaveCount(await options.count());
    expect(await options.count()).toBeGreaterThan(0);
    await targetSelect.selectOption({ index: 1 });
    await expect(targetSelect).not.toHaveValue('');
    const methodInput = popupPage.locator('[data-testid="message-method"]');
    await expect(methodInput).toHaveValue('__getMethodNames__');
    const paramsInput = popupPage.locator('[data-testid="message-params"]');
    await expect(paramsInput).toHaveValue('[]');
    await popupPage.click('[data-testid="message-send-button"]');
    const messageResponse = popupPage.locator(
      '[data-testid="message-response"]',
    );
    await expect(messageResponse).toBeVisible();
    await expect(messageResponse).toContainText(
      '"body":"#[\\"__getMethodNames__\\",\\"bootstrap\\",\\"hello\\"]"',
    );
    await expect(messageResponse).toContainText('"slots":[]');
    await clearLogsButton.click();
    await methodInput.fill('hello');
    await paramsInput.fill('[]');
    await popupPage.click('[data-testid="message-send-button"]');
    await expect(messageResponse).toContainText('"body":"#\\"vat Alice got');
    await expect(messageResponse).toContainText('"slots":[');
    await expect(popupPage.locator('#root')).toContainText(
      'Alice (v1) - 3 objects, 5 promises',
    );
  });

  test('should reload kernel state and load default vats', async () => {
    test.slow();
    await expect(
      popupPage.locator('button:text("Reload Kernel")'),
    ).toBeVisible();
    await popupPage.click('button:text("Reload Kernel")');
    await expect(messageOutput).toContainText('"method": "reload"');
    await expect(messageOutput).toContainText('Default sub-cluster reloaded', {
      timeout: 10000,
    });
  });

  test('should handle cluster configuration updates', async () => {
    const configTitle = popupPage.locator('[data-testid="config-title"]');
    await expect(configTitle).toBeVisible();
    await configTitle.click();
    // Check initial config is visible and matches clusterConfig
    const configTextarea = popupPage.locator('[data-testid="config-textarea"]');
    await expect(configTextarea).toBeVisible();
    await expect(configTextarea).toHaveValue(
      JSON.stringify(defaultClusterConfig, null, 2),
    );
    // Test invalid JSON handling
    await configTextarea.fill('{ invalid json }');
    await popupPage.click('button:text("Update Config")');
    await expect(messageOutput).toContainText('SyntaxError');
    // Verify original vats still exist
    const firstVatKey = Object.keys(
      defaultClusterConfig.vats,
    )[0] as keyof typeof defaultClusterConfig.vats;
    const originalVatName =
      defaultClusterConfig.vats[firstVatKey].parameters.name;
    const vatTable = popupPage.locator('[data-testid="vat-table"]');
    await expect(vatTable).toBeVisible({ timeout: 10000 });
    await expect(vatTable).toContainText(originalVatName);
    // Modify config with new vat name
    const modifiedConfig = structuredClone(defaultClusterConfig);
    modifiedConfig.vats[firstVatKey].parameters.name = 'SuperAlice';
    // Update config and reload
    await configTextarea.fill(JSON.stringify(modifiedConfig, null, 2));
    await popupPage.click('button:text("Update Config")');
    await popupPage.click('button:text("Reload Kernel")');
    // Verify new vat name appears
    await expect(vatTable).toContainText('SuperAlice');
  });

  test('should handle config template selection', async () => {
    const configTitle = popupPage.locator('[data-testid="config-title"]');
    await expect(configTitle).toBeVisible();
    await configTitle.click();
    // Get initial config textarea content
    const configTextarea = popupPage.locator('[data-testid="config-textarea"]');
    await expect(configTextarea).toBeVisible();
    const initialConfig = await configTextarea.inputValue();
    // Select minimal config template
    const configSelect = popupPage.locator('[data-testid="config-select"]');
    await configSelect.selectOption('Minimal');
    // Verify config textarea was updated with minimal config
    const minimalConfig = await configTextarea.inputValue();
    expect(minimalConfig).not.toBe(initialConfig);
    expect(JSON.parse(minimalConfig)).toMatchObject(minimalClusterConfig);
    // Update and reload with minimal config
    await popupPage.click('button:text("Update and Reload")');
    // Verify vat table shows only the main vat
    const vatTable = popupPage.locator('[data-testid="vat-table"]');
    await expect(vatTable).toBeVisible();
    await expect(vatTable.locator('tr')).toHaveCount(2); // Header + 1 row
    await expect(vatTable).toContainText(
      minimalClusterConfig.vats.main.parameters.name,
    );
  });

  test('should collect garbage', async () => {
    const configTitle = popupPage.locator('[data-testid="config-title"]');
    await expect(configTitle).toBeVisible();
    await expect(
      popupPage.locator('button:text("Database Inspector")'),
    ).toBeVisible();
    await popupPage.click('button:text("Database Inspector")');
    await expect(messageOutput).toContainText(
      '{"key":"vats.terminated","value":"[]"}',
    );
    const v3Values = [
      '{"key":"e.nextPromiseId.v3","value":"2"}',
      '{"key":"e.nextObjectId.v3","value":"1"}',
      '{"key":"ko3.owner","value":"v3"}',
      '{"key":"v3.c.ko3","value":"R o+0"}',
      '{"key":"v3.c.o+0","value":"ko3"}',
      '{"key":"v3.c.kp3","value":"R p-1"}',
      '{"key":"v3.c.p-1","value":"kp3"}',
      '{"key":"ko3.refCount","value":"1,1"}',
    ];
    const v1ko3Values = [
      '{"key":"v1.c.ko3","value":"R o-2"}',
      '{"key":"v1.c.o-2","value":"ko3"}',
      '{"key":"kp3.state","value":"fulfilled"}',
      '{"key":"kp3.value","value"',
    ];
    await expect(messageOutput).toContainText(
      '{"key":"kp3.refCount","value":"2"}',
    );
    await expect(messageOutput).toContainText('{"key":"vatConfig.v3","value"');
    for (const value of v3Values) {
      await expect(messageOutput).toContainText(value);
    }
    for (const value of v1ko3Values) {
      await expect(messageOutput).toContainText(value);
    }
    await popupPage.click('button:text("Control Panel")');
    await popupPage.locator('td button:text("Terminate")').last().click();
    await expect(messageOutput).toContainText('Terminated vat "v3"');
    await popupPage.locator('[data-testid="clear-logs-button"]').click();
    await expect(messageOutput).toContainText('');
    await popupPage.click('button:text("Database Inspector")');
    await expect(messageOutput).toContainText(
      '{"key":"vats.terminated","value":"[\\"v3\\"]"}',
    );
    await expect(messageOutput).not.toContainText(
      '{"key":"vatConfig.v3","value"',
    );
    for (const value of v3Values) {
      await expect(messageOutput).toContainText(value);
    }
    await popupPage.click('button:text("Control Panel")');

    await popupPage.click('button:text("Collect Garbage")');
    await expect(messageOutput).toContainText('Garbage collected');
    await popupPage.locator('[data-testid="clear-logs-button"]').click();
    await expect(messageOutput).toContainText('');
    await popupPage.click('button:text("Database Inspector")');
    // v3 is gone
    for (const value of v3Values) {
      await expect(messageOutput).not.toContainText(value);
    }
    // ko3 reference still exists for v1
    for (const value of v1ko3Values) {
      await expect(messageOutput).toContainText(value);
    }
    // kp3 reference dropped to 1
    await expect(messageOutput).toContainText(
      '{"key":"kp3.refCount","value":"1"}',
    );
    await popupPage.click('button:text("Control Panel")');
    // delete v1
    await popupPage.locator('td button:text("Terminate")').first().click();
    await expect(messageOutput).toContainText('Terminated vat "v1"');
    await popupPage.click('button:text("Collect Garbage")');
    await expect(messageOutput).toContainText('Garbage collected');
    await popupPage.locator('[data-testid="clear-logs-button"]').click();
    await expect(messageOutput).toContainText('');
    await popupPage.click('button:text("Database Inspector")');
    await expect(messageOutput).toContainText(
      '{"key":"vats.terminated","value":"[]"}',
    );
    for (const value of v1ko3Values) {
      await expect(messageOutput).not.toContainText(value);
    }
  });
});
