import { clearStateHandler, clearStateSpec } from './clear-state.ts';
import {
  collectGarbageHandler,
  collectGarbageSpec,
} from './collect-garbage.ts';
import { evaluateVatHandler, evaluateVatSpec } from './evaluate-vat.ts';
import {
  executeDBQueryHandler,
  executeDBQuerySpec,
} from './execute-db-query.ts';
import { getStatusHandler, getStatusSpec } from './get-status.ts';
import { isRevokedHandler, isRevokedSpec } from './is-revoked.ts';
import {
  launchSubclusterHandler,
  launchSubclusterSpec,
} from './launch-subcluster.ts';
import { pingVatHandler, pingVatSpec } from './ping-vat.ts';
import { queueMessageHandler, queueMessageSpec } from './queue-message.ts';
import { reloadConfigHandler, reloadConfigSpec } from './reload-config.ts';
import {
  reloadSubclusterHandler,
  reloadSubclusterSpec,
} from './reload-subcluster.ts';
import { restartVatHandler, restartVatSpec } from './restart-vat.ts';
import { revokeHandler, revokeSpec } from './revoke.ts';
import {
  terminateAllVatsHandler,
  terminateAllVatsSpec,
} from './terminate-all-vats.ts';
import {
  terminateSubclusterHandler,
  terminateSubclusterSpec,
} from './terminate-subcluster.ts';
import { terminateVatHandler, terminateVatSpec } from './terminate-vat.ts';

/**
 * Call-ee side handlers for the kernel control methods.
 */
export const rpcHandlers = {
  clearState: clearStateHandler,
  evaluateVat: evaluateVatHandler,
  executeDBQuery: executeDBQueryHandler,
  getStatus: getStatusHandler,
  pingVat: pingVatHandler,
  reload: reloadConfigHandler,
  revoke: revokeHandler,
  isRevoked: isRevokedHandler,
  restartVat: restartVatHandler,
  queueMessage: queueMessageHandler,
  terminateAllVats: terminateAllVatsHandler,
  collectGarbage: collectGarbageHandler,
  terminateVat: terminateVatHandler,
  launchSubcluster: launchSubclusterHandler,
  reloadSubcluster: reloadSubclusterHandler,
  terminateSubcluster: terminateSubclusterHandler,
} as {
  clearState: typeof clearStateHandler;
  evaluateVat: typeof evaluateVatHandler;
  executeDBQuery: typeof executeDBQueryHandler;
  getStatus: typeof getStatusHandler;
  pingVat: typeof pingVatHandler;
  reload: typeof reloadConfigHandler;
  revoke: typeof revokeHandler;
  isRevoked: typeof isRevokedHandler;
  restartVat: typeof restartVatHandler;
  queueMessage: typeof queueMessageHandler;
  terminateAllVats: typeof terminateAllVatsHandler;
  collectGarbage: typeof collectGarbageHandler;
  terminateVat: typeof terminateVatHandler;
  launchSubcluster: typeof launchSubclusterHandler;
  reloadSubcluster: typeof reloadSubclusterHandler;
  terminateSubcluster: typeof terminateSubclusterHandler;
};

/**
 * Call-er side method specs for the kernel control methods.
 */
export const rpcMethodSpecs = {
  clearState: clearStateSpec,
  evaluateVat: evaluateVatSpec,
  executeDBQuery: executeDBQuerySpec,
  getStatus: getStatusSpec,
  pingVat: pingVatSpec,
  reload: reloadConfigSpec,
  revoke: revokeSpec,
  isRevoked: isRevokedSpec,
  restartVat: restartVatSpec,
  queueMessage: queueMessageSpec,
  terminateAllVats: terminateAllVatsSpec,
  collectGarbage: collectGarbageSpec,
  terminateVat: terminateVatSpec,
  launchSubcluster: launchSubclusterSpec,
  reloadSubcluster: reloadSubclusterSpec,
  terminateSubcluster: terminateSubclusterSpec,
} as {
  clearState: typeof clearStateSpec;
  evaluateVat: typeof evaluateVatSpec;
  executeDBQuery: typeof executeDBQuerySpec;
  getStatus: typeof getStatusSpec;
  pingVat: typeof pingVatSpec;
  reload: typeof reloadConfigSpec;
  revoke: typeof revokeSpec;
  isRevoked: typeof isRevokedSpec;
  restartVat: typeof restartVatSpec;
  queueMessage: typeof queueMessageSpec;
  terminateAllVats: typeof terminateAllVatsSpec;
  collectGarbage: typeof collectGarbageSpec;
  terminateVat: typeof terminateVatSpec;
  launchSubcluster: typeof launchSubclusterSpec;
  reloadSubcluster: typeof reloadSubclusterSpec;
  terminateSubcluster: typeof terminateSubclusterSpec;
};

type Handlers = (typeof rpcHandlers)[keyof typeof rpcHandlers];

export type KernelControlMethod = Handlers['method'];
