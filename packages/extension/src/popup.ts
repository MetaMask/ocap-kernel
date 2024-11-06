import { setupButtonHandlers } from './panel/buttons.js';
import { setupTemplateHandlers } from './panel/messages.js';
import { logger } from './panel/shared.js';
import { setupVatListeners } from './panel/status.js';
import { setupStream, setupStatusPolling } from './panel/stream.js';

/**
 * Main function to initialize the popup.
 */
async function main(): Promise<void> {
  const sendMessage = await setupStream();

  setupVatListeners();
  setupButtonHandlers(sendMessage);
  setupTemplateHandlers(sendMessage);

  await setupStatusPolling(sendMessage);
}

main().catch(logger.error);
