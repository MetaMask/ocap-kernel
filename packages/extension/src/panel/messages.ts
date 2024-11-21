import { KernelCommandMethod, VatCommandMethod, isVatId } from '@ocap/kernel';
import type { KernelCommand } from '@ocap/kernel';
import { stringify } from '@ocap/utils';

import { vatDropdown } from './buttons.js';
import { updateStatusDisplay } from './status.js';
import {
  KernelControlMethod,
  isKernelControlReply,
  isKernelStatus,
} from '../kernel-integration/messages.js';
import type {
  KernelControlCommand,
  KernelControlReply,
} from '../kernel-integration/messages.js';

const outputBox = document.getElementById('output-box') as HTMLElement;
const messageOutput = document.getElementById(
  'message-output',
) as HTMLPreElement;
export const messageContent = document.getElementById(
  'message-content',
) as HTMLInputElement;
const messageTemplates = document.getElementById(
  'message-templates',
) as HTMLElement;
export const sendButton = document.getElementById(
  'send-message',
) as HTMLButtonElement;

export const commonMessages: Record<string, KernelCommand> = {
  Ping: { method: VatCommandMethod.ping, params: null },
  Evaluate: {
    method: VatCommandMethod.evaluate,
    params: `[1,2,3].join(',')`,
  },
  KVSet: {
    method: KernelCommandMethod.kvSet,
    params: { key: 'foo', value: 'bar' },
  },
  KVGet: { method: KernelCommandMethod.kvGet, params: 'foo' },
};

/**
 * Show an output message in the message output box.
 *
 * @param message - The message to display.
 * @param type - The type of message to display.
 */
export function showOutput(
  message: string,
  type: 'error' | 'success' | 'info' = 'info',
): void {
  messageOutput.textContent = message;
  messageOutput.className = type;
  outputBox.style.display = message ? 'block' : 'none';
}

/**
 * Setup handlers for template buttons.
 *
 * @param sendMessage - The function to send messages to the kernel.
 */
export function setupTemplateHandlers(
  sendMessage: (message: KernelControlCommand) => Promise<void>,
): void {
  Object.keys(commonMessages).forEach((templateName) => {
    const button = document.createElement('button');
    button.className = 'text-button template';
    button.textContent = templateName;

    button.addEventListener('click', () => {
      messageContent.value = stringify(commonMessages[templateName], 0);
      sendButton.disabled = false;
    });

    messageTemplates.appendChild(button);
  });

  sendButton.addEventListener('click', () => {
    (async () => {
      const command: KernelControlCommand = {
        method: KernelControlMethod.sendMessage,
        params: {
          payload: JSON.parse(messageContent.value),
          ...(isVatId(vatDropdown.value) ? { id: vatDropdown.value } : {}),
        },
      };
      await sendMessage(command);
    })().catch((error) => showOutput(String(error), 'error'));
  });

  messageContent.addEventListener('input', () => {
    sendButton.disabled = !messageContent.value.trim();
  });

  vatDropdown.addEventListener('change', () => {
    sendButton.textContent = vatDropdown.value ? 'Send to Vat' : 'Send';
  });
}

/**
 * Handle a kernel message.
 *
 * @param message - The message to handle.
 */
export function handleKernelMessage(message: KernelControlReply): void {
  if (!isKernelControlReply(message) || message.params === null) {
    showOutput('');
    return;
  }

  if (isKernelStatus(message.params)) {
    updateStatusDisplay(message.params);
    return;
  }

  if (isErrorResponse(message.params)) {
    showOutput(stringify(message.params.error, 0), 'error');
  } else {
    showOutput(stringify(message.params, 2), 'info');
  }
}

type ErrorResponse = {
  error: unknown;
};

/**
 * Checks if a value is an error response.
 *
 * @param value - The value to check.
 * @returns Whether the value is an error response.
 */
function isErrorResponse(value: unknown): value is ErrorResponse {
  return typeof value === 'object' && value !== null && 'error' in value;
}
