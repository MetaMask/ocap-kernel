import '../../../test-utils/src/env/mock-endo.ts';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { setupPanelDOM } from '../../test/panel-utils.js';

describe('buttons', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.resetModules();
    await setupPanelDOM();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('button commands', () => {
    it('should generate correct launch vat command', async () => {
      const { buttons, newVatId } = await import('./buttons');
      newVatId.value = 'v1';
      const command = buttons.launchVat?.command();

      expect(command).toStrictEqual({
        method: 'launchVat',
        params: { id: 'v1' },
      });
    });

    it('should generate correct restart vat command', async () => {
      const { buttons, vatId } = await import('./buttons');
      vatId.value = 'v0';
      const command = buttons.restartVat?.command();

      expect(command).toStrictEqual({
        method: 'restartVat',
        params: { id: 'v0' },
      });
    });

    it('should generate correct terminate vat command', async () => {
      const { buttons, vatId } = await import('./buttons');
      vatId.value = 'v0';
      const command = buttons.terminateVat?.command();

      expect(command).toStrictEqual({
        method: 'terminateVat',
        params: { id: 'v0' },
      });
    });

    it('should generate correct terminate all vats command', async () => {
      const { buttons } = await import('./buttons');
      const command = buttons.terminateAllVats?.command();

      expect(command).toStrictEqual({
        method: 'terminateAllVats',
        params: null,
      });
    });
  });

  describe('setupButtonHandlers', () => {
    it('should set up click handlers for all buttons', async () => {
      const sendMessage = vi.fn().mockResolvedValue(undefined);
      const { buttons, newVatId, vatId, setupButtonHandlers } = await import(
        './buttons'
      );
      newVatId.value = 'v1';
      vatId.value = 'v1';

      setupButtonHandlers(sendMessage);

      // Test each button click
      await Promise.all(
        Object.values(buttons).map(async (button) => {
          button.element.click();
          expect(sendMessage).toHaveBeenCalledWith(button.command());
        }),
      );

      expect(sendMessage).toHaveBeenCalledTimes(Object.keys(buttons).length);
    });
  });
});
