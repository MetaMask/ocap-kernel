import { clearStateHandler } from './clear-state.js';
import { executeDBQueryHandler } from './execute-db-query.js';
import { getStatusHandler } from './get-status.js';
import { launchVatHandler } from './launch-vat.js';
import { restartVatHandler } from './restart-vat.js';
import { sendMessageHandler } from './send-message.js';
import { terminateAllVatsHandler } from './terminate-all-vats.js';
import { terminateVatHandler } from './terminate-vat.js';

export const handlers = [
  getStatusHandler,
  clearStateHandler,
  sendMessageHandler,
  executeDBQueryHandler,
  launchVatHandler,
  restartVatHandler,
  terminateVatHandler,
  terminateAllVatsHandler,
] as const;
