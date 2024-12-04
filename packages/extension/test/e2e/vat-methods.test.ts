import { test, expect } from '@playwright/test';
import type { Page, BrowserContext } from '@playwright/test';

import { makeLoadExtension } from '../helpers/extension.js';

test.describe('Vat Methods', () => {
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
    await popupPage.waitForSelector('.kernel-panel');
    await popupPage.fill('#new-vat-name', '');
    await popupPage.fill('#bundle-url', '');
    await popupPage.selectOption('#vat-dropdown', '');
    await popupPage.click('#terminate-all');
    await expect(popupPage.locator('#status-display')).toContainText(
      'Active Vats (0)',
    );
  });

  test.describe('Sample Vat Methods', () => {
    test('should load and execute whatIsTheGreatFrangooly method', async () => {
      // Launch sample vat
      await popupPage.fill('#new-vat-name', 'sample-test');
      await popupPage.fill(
        '#bundle-url',
        'http://localhost:3000/sample-vat.bundle',
      );
      await popupPage.click('#launch-vat');

      // Select the vat from the dropdown
      const option = popupPage
        .locator('#vat-dropdown option[value]:not([value=""])')
        .first();
      const vatId = await option.getAttribute('value');
      await popupPage.selectOption('#vat-dropdown', vatId);

      // Wait for methods panel to be visible
      await expect(popupPage.locator('#vat-methods')).toBeVisible();

      // Select the method
      await popupPage.selectOption(
        '#method-dropdown',
        'whatIsTheGreatFrangooly',
      );

      // Execute method
      await popupPage.click('#execute-method');

      // Verify output
      await expect(popupPage.locator('#message-output')).toContainText(
        'Crowned with Chaos',
      );
    });
  });

  test.describe('Storage Vat Methods', () => {
    test.beforeEach(async () => {
      // Launch storage vat
      await popupPage.fill('#new-vat-name', 'storage-test');
      await popupPage.fill(
        '#bundle-url',
        'http://localhost:3000/storage-vat.bundle',
      );
      await popupPage.click('#launch-vat');
      await expect(popupPage.locator('#status-display')).toContainText(
        'Active Vats (1)',
      );

      // Select the vat from the dropdown
      const option = popupPage
        .locator('#vat-dropdown option[value]:not([value=""])')
        .first();
      const vatId = await option.getAttribute('value');
      await popupPage.selectOption('#vat-dropdown', vatId);
    });

    test('should handle preferences operations', async () => {
      // Test setPreference
      await popupPage.selectOption('#method-dropdown', 'setPreference');
      await popupPage.fill('#param-0', 'testKey');
      await popupPage.fill('#param-1', 'testValue');
      await popupPage.click('#execute-method');
      await expect(popupPage.locator('#message-output')).toContainText('true');

      // Test getPreference
      await popupPage.selectOption('#method-dropdown', 'getPreference');
      await popupPage.fill('#param-0', 'testKey');
      await popupPage.click('#execute-method');
      await expect(popupPage.locator('#message-output')).toContainText(
        'testValue',
      );

      // Test getAllPreferences
      await popupPage.selectOption('#method-dropdown', 'getAllPreferences');
      await popupPage.click('#execute-method');
      await expect(popupPage.locator('#message-output')).toContainText(
        '"testKey": "testValue"',
      );

      // Test persistence
      await popupPage.click('#restart-vat');
      await popupPage.selectOption('#method-dropdown', 'getPreference');
      await popupPage.fill('#param-0', 'testKey');
      await popupPage.click('#execute-method');
      await expect(popupPage.locator('#message-output')).toContainText(
        'testValue',
      );

      // Test clearPreferences
      await popupPage.selectOption('#method-dropdown', 'clearPreferences');
      await popupPage.click('#execute-method');
      await expect(popupPage.locator('#message-output')).toContainText('true');

      // Verify preferences were cleared
      await popupPage.selectOption('#method-dropdown', 'getAllPreferences');
      await popupPage.click('#execute-method');
      await expect(popupPage.locator('#message-output')).toContainText('{}');
    });

    test('should handle session operations', async () => {
      // Get current session ID
      await popupPage.selectOption('#method-dropdown', 'getSessionId');
      await popupPage.click('#execute-method');
      await expect(popupPage.locator('#message-output')).toContainText(
        '"result": "session_',
      );

      // Create new session
      await popupPage.selectOption('#method-dropdown', 'createSession');
      await popupPage.fill('#param-0', 'test-session');
      await popupPage.fill('#param-1', '{"test":"data"}');
      await popupPage.click('#execute-method');
      await expect(popupPage.locator('#message-output')).toContainText(
        'test-session',
      );

      // Get session
      await popupPage.selectOption('#method-dropdown', 'getSession');
      await popupPage.fill('#param-0', 'test-session');
      await popupPage.click('#execute-method');
      await expect(popupPage.locator('#message-output')).toContainText(
        '"test": "data"',
      );

      // Update session
      await popupPage.selectOption('#method-dropdown', 'updateSession');
      await popupPage.fill('#param-0', 'test-session');
      await popupPage.fill('#param-1', '{"test":"updated"}');
      await popupPage.click('#execute-method');
      await expect(popupPage.locator('#message-output')).toContainText('true');

      // Keep session alive
      await popupPage.selectOption('#method-dropdown', 'keepSessionAlive');
      await popupPage.fill('#param-0', 'test-session');
      await popupPage.click('#execute-method');
      await expect(popupPage.locator('#message-output')).toContainText('true');

      // Release session
      await popupPage.selectOption('#method-dropdown', 'releaseSession');
      await popupPage.fill('#param-0', 'test-session');
      await popupPage.click('#execute-method');
      await expect(popupPage.locator('#message-output')).toContainText('true');
    });

    test('should display vat statistics', async () => {
      await popupPage.selectOption('#method-dropdown', 'getStats');
      await popupPage.click('#execute-method');
      await expect(popupPage.locator('#message-output')).toContainText(
        'initialized',
      );

      const output = await popupPage.locator('#message-output').textContent();
      const stats = JSON.parse(output ?? '{}');
      expect(stats).toHaveProperty('result.initialized');
      expect(stats).toHaveProperty('result.lastAccessed');
      expect(stats).toHaveProperty('result.preferencesCount');
      expect(stats).toHaveProperty('result.activeSessions');
    });
  });
});
