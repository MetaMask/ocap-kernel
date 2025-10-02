import { makeLoadExtension } from '@ocap/repo-tools/test-utils/extension';
import { expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export { sessionPath } from '@ocap/repo-tools/test-utils/extension';

const extensionPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../dist',
);

export const loadExtension = async (contextId?: string) => {
  return makeLoadExtension({
    contextId,
    extensionPath,
    onPageLoad: async (popupPage) => {
      // Wait for the default subcluster accordion to be visible
      await expect(
        popupPage.locator('text=Subcluster s1 - 3 Vats'),
      ).toBeVisible();
    },
  });
};
