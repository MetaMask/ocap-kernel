import { clearStateHandler } from './clear-state.js';
import { executeDBQueryHandler } from './execute-db-query.js';
import { getStatusHandler } from './get-status.js';
import { launchVatHandler } from './launch-vat.js';
import { reloadConfigHandler } from './reload-config.js';
import { restartVatHandler } from './restart-vat.js';
import { sendVatCommandHandler } from './send-vat-command.js';
import { terminateAllVatsHandler } from './terminate-all-vats.js';
import { terminateVatHandler } from './terminate-vat.js';
import { updateClusterConfigHandler } from './update-cluster-config.js';

export const handlers = [
  getStatusHandler,
  clearStateHandler,
  sendVatCommandHandler,
  executeDBQueryHandler,
  launchVatHandler,
  reloadConfigHandler,
  restartVatHandler,
  terminateVatHandler,
  terminateAllVatsHandler,
  updateClusterConfigHandler,
] as const;
