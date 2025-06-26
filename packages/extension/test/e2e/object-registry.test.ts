import { test, expect } from '@playwright/test';
import type { Page, BrowserContext } from '@playwright/test';

import {
  revokeObject,
  sendMessage,
  openObjectRegistryTab,
} from './object-registry.ts';
import { makeLoadExtension } from '../helpers/extension.ts';

test.describe.configure({ mode: 'serial' });

test.describe('Object Registry', () => {
  let extensionContext: BrowserContext;
  let popupPage: Page;

  test.beforeEach(async () => {
    const extension = await makeLoadExtension();
    extensionContext = extension.browserContext;
    popupPage = extension.popupPage;
    await openObjectRegistryTab(popupPage, expect);
  });

  test.afterEach(async () => {
    await extensionContext.close();
  });

  const owner = 'v1';
  const [target, method, params] = ['ko1', 'hello', '["Bob"]'];

  test('should send a message to an object', async () => {
    const response = await sendMessage(popupPage, target, method, params);
    await expect(response).toContainText(/body(.+):(.+)hello(.+)from(.+)Bob/u);
  });

  test('should revoke an object', async () => {
    let response = await revokeObject(popupPage, owner, target);
    await expect(response).toContainText(`Revoked object ${target}`);

    // After revoking, the previously successful message should fail
    response = await sendMessage(popupPage, target, method, params);
    await expect(response).toContainText(/[Rr]evoked object/u);
  });
});
