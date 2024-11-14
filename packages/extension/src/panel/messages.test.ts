import '../../../test-utils/src/env/mock-endo.ts';
import { define } from '@metamask/superstruct';
import type { VatId } from '@ocap/kernel';
import { stringify } from '@ocap/utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { setupPanelDOM } from '../../test/panel-utils.js';

const isVatId = vi.fn(
  (input: unknown): input is VatId => typeof input === 'string',
);

// Mock kernel imports
vi.mock('@ocap/kernel', () => ({
  isVatId,
  VatCommandMethod: {
    ping: 'ping',
    evaluate: 'evaluate',
  },
  KernelCommandMethod: {
    kvSet: 'kvSet',
    kvGet: 'kvGet',
  },
  VatIdStruct: define<VatId>('VatId', isVatId),
}));

describe('messages', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.resetModules();
    await setupPanelDOM();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('showOutput', () => {
    it('should display error messages correctly', async () => {
      const { showOutput } = await import('./messages');
      const errorMessage = 'Test error message';

      showOutput(errorMessage, 'error');

      const output = document.getElementById('message-output');
      const outputBox = document.getElementById('output-box');

      expect(output?.textContent).toBe(errorMessage);
      expect(output?.className).toBe('error');
      expect(outputBox?.style.display).toBe('block');
    });

    it('should hide output box when message is empty', async () => {
      const { showOutput } = await import('./messages');

      showOutput('');

      const outputBox = document.getElementById('output-box');
      expect(outputBox?.style.display).toBe('none');
    });
  });

  describe('setupTemplateHandlers', () => {
    it('should create template buttons with correct messages', async () => {
      const { setupTemplateHandlers, commonMessages } = await import(
        './messages'
      );
      const sendMessage = vi.fn().mockResolvedValue(undefined);

      setupTemplateHandlers(sendMessage);

      const templates = document.querySelectorAll('.template');
      expect(templates).toHaveLength(Object.keys(commonMessages).length);

      // Check if each template button exists
      Object.keys(commonMessages).forEach((templateName) => {
        const button = Array.from(templates).find(
          (el) => el.textContent === templateName,
        );
        expect(button).not.toBeNull();
      });
    });

    it('should update message content when template button is clicked', async () => {
      const {
        setupTemplateHandlers,
        commonMessages,
        messageContent,
        sendButton,
      } = await import('./messages');
      const sendMessage = vi.fn().mockResolvedValue(undefined);

      setupTemplateHandlers(sendMessage);

      const firstTemplateName = Object.keys(commonMessages)[0] as string;
      const firstTemplate = document.querySelector(
        '.template',
      ) as HTMLButtonElement;

      firstTemplate.dispatchEvent(new Event('click'));

      expect(messageContent.value).toBe(
        stringify(commonMessages[firstTemplateName], 0),
      );
      expect(sendButton.disabled).toBe(false);
    });

    it('should send message when send button is clicked', async () => {
      const { setupTemplateHandlers, messageContent, sendButton } =
        await import('./messages');
      const { vatId } = await import('./buttons.js');
      const sendMessage = vi.fn().mockResolvedValue(undefined);
      isVatId.mockReturnValue(true);

      setupTemplateHandlers(sendMessage);

      // Setup test data
      messageContent.value = '{"method":"ping","params":null}';
      vatId.value = 'v0';

      sendButton.dispatchEvent(new Event('click'));

      expect(isVatId).toHaveBeenCalledWith('v0');

      expect(sendMessage).toHaveBeenCalledWith({
        method: 'sendMessage',
        params: {
          id: 'v0',
          payload: { method: 'ping', params: null },
        },
      });
    });

    it('should send message without vat id when send button is clicked', async () => {
      const { setupTemplateHandlers, messageContent, sendButton } =
        await import('./messages');
      const { vatId } = await import('./buttons.js');
      const sendMessage = vi.fn().mockResolvedValue(undefined);
      isVatId.mockReturnValue(false);

      setupTemplateHandlers(sendMessage);

      messageContent.value =
        '{"method":"kvSet","params":{"key":"test","value":"test"}}';
      vatId.value = '';

      sendButton.dispatchEvent(new Event('click'));

      expect(isVatId).toHaveBeenCalledWith('');

      expect(sendMessage).toHaveBeenCalledWith({
        method: 'sendMessage',
        params: {
          payload: { method: 'kvSet', params: { key: 'test', value: 'test' } },
        },
      });
    });

    it('should handle send button state based on message content', async () => {
      const { setupTemplateHandlers, messageContent, sendButton } =
        await import('./messages');
      const sendMessage = vi.fn().mockResolvedValue(undefined);

      setupTemplateHandlers(sendMessage);

      // Empty content should disable button
      messageContent.value = '';
      messageContent.dispatchEvent(new Event('input'));
      expect(sendButton.disabled).toBe(true);

      // Non-empty content should enable button
      messageContent.value = '{"method":"ping","params":null}';
      messageContent.dispatchEvent(new Event('input'));
      expect(sendButton.disabled).toBe(false);
    });

    it('should update send button text based on vat selection', async () => {
      const { setupTemplateHandlers } = await import('./messages');
      const sendMessage = vi.fn().mockResolvedValue(undefined);

      setupTemplateHandlers(sendMessage);

      const vatId = document.getElementById('vat-id') as HTMLSelectElement;
      const sendButton = document.getElementById(
        'send-message',
      ) as HTMLButtonElement;

      // With vat selected
      vatId.value = 'v0';
      vatId.dispatchEvent(new Event('change'));
      expect(sendButton.textContent).toBe('Send to Vat');

      // Without vat selected
      vatId.value = '';
      vatId.dispatchEvent(new Event('change'));
      expect(sendButton.textContent).toBe('Send');
    });

    it('should handle send errors correctly', async () => {
      const { setupTemplateHandlers, messageContent, sendButton } =
        await import('./messages');
      const error = new Error('Test error');
      const sendMessage = vi.fn().mockRejectedValue(error);

      setupTemplateHandlers(sendMessage);

      messageContent.value = '{"method":"ping","params":null}';
      sendButton.dispatchEvent(new Event('click'));

      // Wait for error handling
      await new Promise(process.nextTick);

      const output = document.getElementById('message-output');
      expect(output?.textContent).toBe(error.toString());
      expect(output?.className).toBe('error');
    });
  });
});
