import { setupButtonHandlers } from './panel/buttons.js';
import { setupMessageHandlers } from './panel/messages.js';
import { logger } from './panel/shared.js';
import { setupStatusPolling, setupVatListeners } from './panel/status.js';
import { setupStream } from './panel/stream.js';

/**
 * Main function to initialize the popup.
 */
async function main(): Promise<void> {
  const sendMessage = await setupStream();
  setupVatListeners();
  setupButtonHandlers(sendMessage);
  setupMessageHandlers(sendMessage);
  await setupStatusPolling(sendMessage);
}

main().catch(logger.error);
