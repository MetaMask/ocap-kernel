import type { ExtensionMessage } from './shared';
import { makeHandledCallback } from './shared';

const OFFSCREEN_DOCUMENT_PATH = '/offscreen.html';

// Send
chrome.action.onClicked.addListener(() => {
  sendMessage('greetings', { name: 'Kernel' }).catch(console.error);
});

/**
 * Send a message to the offscreen document.
 * @param type - The message type.
 * @param data - The message data.
 * @param data.name - The name to include in the message.
 */
async function sendMessage(type: string, data: { name: string }) {
  await provideOffScreenDocument();

  await chrome.runtime.sendMessage({
    type,
    target: 'offscreen',
    data,
  });
}

/**
 * Create the offscreen document if it doesn't already exist.
 */
async function provideOffScreenDocument() {
  if (!(await chrome.offscreen.hasDocument())) {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: [chrome.offscreen.Reason.IFRAME_SCRIPTING],
      justification: `Surely you won't object to our capabilities?`,
    });
  }
}

// Receive
chrome.runtime.onMessage.addListener(makeHandledCallback(handleMessage));

/**
 * Receive a message from the offscreen document.
 * @param message - The message to handle.
 */
async function handleMessage(message: ExtensionMessage<string>) {
  if (message.target !== 'background') {
    return;
  }

  switch (message.type) {
    case 'salutations':
      console.log(message.data);
      await closeOffscreenDocument();
      break;
    default:
      console.error(`Received unexpected message type: "${message.type}"`);
  }
}

/**
 * Close the offscreen document if it exists.
 */
async function closeOffscreenDocument() {
  if (!(await chrome.offscreen.hasDocument())) {
    return;
  }
  await chrome.offscreen.closeDocument();
}
