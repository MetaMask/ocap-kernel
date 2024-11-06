import { ClusterCommandMethod, isVatId } from '@ocap/kernel';
import type { KernelCommand } from '@ocap/kernel';
import { stringify } from '@ocap/utils';

import { vatId } from './buttons.js';
import type { KernelControlCommand } from '../kernel/messages.js';

const outputBox = document.getElementById('output-box') as HTMLElement;
const messageOutput = document.getElementById(
  'message-output',
) as HTMLPreElement;
const messageContent = document.getElementById(
  'message-content',
) as HTMLInputElement;
const messageTemplates = document.getElementById(
  'message-templates',
) as HTMLElement;
const sendButton = document.getElementById('send-message') as HTMLButtonElement;

export const commonMessages: Record<string, KernelCommand> = {
  Ping: { method: ClusterCommandMethod.Ping, params: null },
  Evaluate: {
    method: ClusterCommandMethod.Evaluate,
    params: `[1,2,3].join(',')`,
  },
  KVSet: {
    method: ClusterCommandMethod.KVSet,
    params: { key: 'foo', value: 'bar' },
  },
  KVGet: { method: ClusterCommandMethod.KVGet, params: 'foo' },
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
      const params: KernelControlCommand['params'] = {
        payload: JSON.parse(messageContent.value),
      };
      if (isVatId(vatId.value)) {
        params.id = vatId.value;
      }
      await sendMessage({
        method: 'sendMessage',
        params,
      });
    })().catch((error) => showOutput(String(error), 'error'));
  });

  messageContent.addEventListener('input', () => {
    sendButton.disabled = !messageContent.value.trim();
  });

  vatId.addEventListener('change', () => {
    sendButton.textContent = vatId.value ? 'Send to Vat' : 'Send';
  });
}
