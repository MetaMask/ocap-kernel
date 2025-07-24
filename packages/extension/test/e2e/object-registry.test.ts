import { test, expect } from '@playwright/test';
import type { Page, BrowserContext } from '@playwright/test';

import { revokeObject, sendMessage } from './object-registry.ts';
import { makeLoadExtension } from '../helpers/extension.ts';

test.describe.configure({ mode: 'serial' });

test.describe('Object Registry', () => {
  let extensionContext: BrowserContext;
  let popupPage: Page;

  test.beforeEach(async () => {
    const extension = await makeLoadExtension();
    extensionContext = extension.browserContext;
    popupPage = extension.popupPage;
    const registryButton = popupPage.locator('button:text("Object Registry")');
    await expect(registryButton).toBeVisible();
    await registryButton.click();
  });

  test.afterEach(async () => {
    await extensionContext.close();
  });

  test('should send a message to an object', async () => {
    const clearLogsButton = popupPage.locator(
      '[data-testid="clear-logs-button"]',
    );
    await clearLogsButton.click();
    await popupPage.click('button:text("Object Registry")');
    await expect(popupPage.locator('#root')).toContainText(
      'Alice (v1) - 5 objects, 4 promises',
    );
    const targetSelect = popupPage.locator('[data-testid="message-target"]');
    await expect(targetSelect).toBeVisible();
    const options = targetSelect.locator('option:not([value=""])');
    console.log('options', options);
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
      '"body":"#[\\"__getMethodNames__\\",\\"bootstrap\\",\\"doRunRun\\",\\"hello\\"]"',
    );
    await expect(messageResponse).toContainText('"slots":[]');
    await clearLogsButton.click();
    await methodInput.fill('hello');
    await paramsInput.fill('[]');
    await popupPage.click('[data-testid="message-send-button"]');
    await expect(messageResponse).toContainText('"body":"#\\"vat Alice got');
    await expect(messageResponse).toContainText('"slots":[');
    await expect(popupPage.locator('#root')).toContainText(
      'Alice (v1) - 5 objects, 6 promises',
    );
  });

  test('should revoke an object', async () => {
    const owner = 'v1';
    const [target, method, params] = ['ko3', 'hello', '["Bob"]'];

    // Before revoking, we should be able to send a message to the object
    let response = await sendMessage(popupPage, target, method, params);
    await expect(response).toContainText(/body(.+):(.+)hello(.+)from(.+)Bob/u);

    const { button, output } = await revokeObject(popupPage, owner, target);
    await expect(output).toContainText(`Revoked object ${target}`);

    // After revoking, the revoke button should be disabled and show "Revoked"
    await expect(button).toBeDisabled();
    await expect(button).toHaveText('Revoked');

    // After revoking, the previously successful message should fail
    response = await sendMessage(popupPage, target, method, params);
    await expect(response).toContainText(/[Rr]evoked object/u);
  });
});
