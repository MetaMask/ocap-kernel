import { clearStateHandler } from './clear-state.ts';
import { executeDBQueryHandler } from './execute-db-query.ts';
import { getStatusHandler } from './get-status.ts';
import { launchVatHandler } from './launch-vat.ts';
import { reloadConfigHandler } from './reload-config.ts';
import { restartVatHandler } from './restart-vat.ts';
import { sendVatCommandHandler } from './send-vat-command.ts';
import { terminateAllVatsHandler } from './terminate-all-vats.ts';
import { terminateVatHandler } from './terminate-vat.ts';
import { updateClusterConfigHandler } from './update-cluster-config.ts';

export const handlers = {
  getStatus: getStatusHandler,
  clearState: clearStateHandler,
  sendVatCommand: sendVatCommandHandler,
  executeDBQuery: executeDBQueryHandler,
  launchVat: launchVatHandler,
  reload: reloadConfigHandler,
  restartVat: restartVatHandler,
  terminateVat: terminateVatHandler,
  terminateAllVats: terminateAllVatsHandler,
  updateClusterConfig: updateClusterConfigHandler,
} as const;

export type KernelControlMethod =
  (typeof handlers)[keyof typeof handlers]['method'];
