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

export type KernelControlMethod = (typeof handlers)[number]['method'];
