import type { Page, Expect, Locator } from 'playwright/test';

export const openObjectRegistryTab = async (
  page: Page,
  expect?: Expect,
): Promise<void> => {
  await page.click('button:text("Object Registry")');
  await expect?.(page.locator('#root')).toContainText('Object Registry');
};

export const sendMessage = async (
  page: Page,
  target: string,
  method: string,
  params: string,
) => {
  await page
    .locator('select[data-testid="message-target"]')
    .selectOption(target);
  await page.locator('input[data-testid="message-method"]').fill(method);
  await page.locator('input[data-testid="message-params"]').fill(params);
  await page.locator('button:text("Send")').click();
  return page.locator('[data-testid="message-response"]');
};

export const revokeObject = async (
  page: Page,
  owner: string,
  target: string,
): Promise<{ button: Locator; output: Locator }> => {
  await page
    .locator(`.accordion-header:has(.accordion-title:text("${owner}"))`)
    .click();
  const button = page.locator(`[data-testid="revoke-button-${target}"]`);
  await button.click();
  return { button, output: page.locator('[data-testid="message-output"]') };
};
