import '@ocap/test-utils/mock-endoify';
import { define } from '@metamask/superstruct';
import type { VatId, VatConfig } from '@ocap/kernel';
import { delay, stringify } from '@ocap/utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { setupPanelDOM } from '../../test/helpers/panel-utils.js';
import type { KernelControlReply } from '../kernel-integration/messages.js';

const isVatId = vi.fn(
  (input: unknown): input is VatId => typeof input === 'string',
);

const isVatConfig = vi.fn(
  (input: unknown): input is VatConfig => typeof input === 'object',
);

vi.mock('./status', () => ({
  updateStatusDisplay: vi.fn(),
}));

// Mock kernel imports
vi.mock('@ocap/kernel', () => ({
  isVatId,
  isVatConfig,
  VatCommandMethod: {
    ping: 'ping',
    evaluate: 'evaluate',
  },
  KernelCommandMethod: {
    kvSet: 'kvSet',
    kvGet: 'kvGet',
  },
  VatIdStruct: define<VatId>('VatId', isVatId),
  VatConfigStruct: define<VatConfig>('VatConfig', isVatConfig),
}));

describe('messages', () => {
  beforeEach(async () => {
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

    it('should properly reset all properties when message is empty', async () => {
      const { showOutput } = await import('./messages');

      showOutput('');

      const output = document.getElementById('message-output');
      const outputBox = document.getElementById('output-box');

      expect(output?.textContent).toBe('');
      expect(output?.className).toBe('info');
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
      const { vatDropdown } = await import('./buttons.js');
      const sendMessage = vi.fn().mockResolvedValue(undefined);
      isVatId.mockReturnValue(true);

      setupTemplateHandlers(sendMessage);

      // Setup test data
      messageContent.value = '{"method":"ping","params":null}';
      vatDropdown.value = 'v0';

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
      const { vatDropdown } = await import('./buttons.js');
      const sendMessage = vi.fn().mockResolvedValue(undefined);
      isVatId.mockReturnValue(false);

      setupTemplateHandlers(sendMessage);

      messageContent.value =
        '{"method":"kvSet","params":{"key":"test","value":"test"}}';
      vatDropdown.value = '';

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
      const { vatDropdown } = await import('./buttons');
      const sendMessage = vi.fn().mockResolvedValue(undefined);

      setupTemplateHandlers(sendMessage);

      const sendButton = document.getElementById(
        'send-message',
      ) as HTMLButtonElement;

      // With vat selected
      vatDropdown.value = 'v0';
      vatDropdown.dispatchEvent(new Event('change'));
      expect(sendButton.textContent).toBe('Send to Vat');

      // Without vat selected
      vatDropdown.value = '';
      vatDropdown.dispatchEvent(new Event('change'));
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
      await delay();

      const output = document.getElementById('message-output');
      expect(output?.textContent).toBe(error.toString());
      expect(output?.className).toBe('error');
    });
  });

  describe('handleKernelMessage', () => {
    it('should ignore invalid kernel control replies', async () => {
      const { handleKernelMessage } = await import('./messages');
      const invalidMessage = { method: 'invalid' };
      handleKernelMessage(invalidMessage as KernelControlReply);
      const output = document.getElementById('message-output');
      expect(output?.textContent).toBe('');
    });

    it('should handle kernel status updates', async () => {
      const { handleKernelMessage } = await import('./messages');
      const { updateStatusDisplay } = await import('./status');
      const statusMessage: KernelControlReply = {
        method: 'getStatus',
        params: {
          isRunning: true,
          activeVats: ['v0'],
        },
      };
      handleKernelMessage(statusMessage);
      expect(updateStatusDisplay).toHaveBeenCalledWith(statusMessage.params);
    });

    it('should display error responses from sendMessage', async () => {
      const { handleKernelMessage } = await import('./messages');
      const errorMessage: KernelControlReply = {
        method: 'sendMessage',
        params: {
          error: 'Test error message',
        },
      };
      handleKernelMessage(errorMessage);
      const output = document.getElementById('message-output');
      expect(output?.textContent).toBe('"Test error message"');
      expect(output?.className).toBe('error');
    });

    it('should display successful responses from sendMessage', async () => {
      const { handleKernelMessage } = await import('./messages');
      const successMessage: KernelControlReply = {
        method: 'sendMessage',
        params: {
          result: 'Success',
        },
      };
      handleKernelMessage(successMessage);
      const output = document.getElementById('message-output');
      expect(output?.textContent).toBe('{\n  "result": "Success"\n}');
      expect(output?.className).toBe('info');
    });
  });
});
