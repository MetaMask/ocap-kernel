import { clearStateHandler, clearStateSpec } from './clear-state.ts';
import {
  collectGarbageHandler,
  collectGarbageSpec,
} from './collect-garbage.ts';
import {
  executeDBQueryHandler,
  executeDBQuerySpec,
} from './execute-db-query.ts';
import { getStatusHandler, getStatusSpec } from './get-status.ts';
import { isRevokedHandler, isRevokedSpec } from './is-revoked.ts';
import { issueOcapURLHandler, issueOcapURLSpec } from './issue-ocap-url.ts';
import {
  launchSubclusterHandler,
  launchSubclusterSpec,
} from './launch-subcluster.ts';
import { pingVatHandler, pingVatSpec } from './ping-vat.ts';
import { queueMessageHandler, queueMessageSpec } from './queue-message.ts';
import { redeemOcapURLHandler, redeemOcapURLSpec } from './redeem-ocap-url.ts';
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
  executeDBQuery: executeDBQueryHandler,
  getStatus: getStatusHandler,
  issueOcapURL: issueOcapURLHandler,
  pingVat: pingVatHandler,
  redeemOcapURL: redeemOcapURLHandler,
  revoke: revokeHandler,
  isRevoked: isRevokedHandler,
  restartVat: restartVatHandler,
  queueMessage: queueMessageHandler,
  terminateAllVats: terminateAllVatsHandler,
  collectGarbage: collectGarbageHandler,
  terminateVat: terminateVatHandler,
  launchSubcluster: launchSubclusterHandler,
  terminateSubcluster: terminateSubclusterHandler,
} as {
  clearState: typeof clearStateHandler;
  executeDBQuery: typeof executeDBQueryHandler;
  getStatus: typeof getStatusHandler;
  issueOcapURL: typeof issueOcapURLHandler;
  pingVat: typeof pingVatHandler;
  redeemOcapURL: typeof redeemOcapURLHandler;
  revoke: typeof revokeHandler;
  isRevoked: typeof isRevokedHandler;
  restartVat: typeof restartVatHandler;
  queueMessage: typeof queueMessageHandler;
  terminateAllVats: typeof terminateAllVatsHandler;
  collectGarbage: typeof collectGarbageHandler;
  terminateVat: typeof terminateVatHandler;
  launchSubcluster: typeof launchSubclusterHandler;
  terminateSubcluster: typeof terminateSubclusterHandler;
};

/**
 * Call-er side method specs for the kernel control methods.
 */
export const rpcMethodSpecs = {
  clearState: clearStateSpec,
  executeDBQuery: executeDBQuerySpec,
  getStatus: getStatusSpec,
  issueOcapURL: issueOcapURLSpec,
  pingVat: pingVatSpec,
  redeemOcapURL: redeemOcapURLSpec,
  revoke: revokeSpec,
  isRevoked: isRevokedSpec,
  restartVat: restartVatSpec,
  queueMessage: queueMessageSpec,
  terminateAllVats: terminateAllVatsSpec,
  collectGarbage: collectGarbageSpec,
  terminateVat: terminateVatSpec,
  launchSubcluster: launchSubclusterSpec,
  terminateSubcluster: terminateSubclusterSpec,
} as {
  clearState: typeof clearStateSpec;
  executeDBQuery: typeof executeDBQuerySpec;
  getStatus: typeof getStatusSpec;
  issueOcapURL: typeof issueOcapURLSpec;
  pingVat: typeof pingVatSpec;
  redeemOcapURL: typeof redeemOcapURLSpec;
  revoke: typeof revokeSpec;
  isRevoked: typeof isRevokedSpec;
  restartVat: typeof restartVatSpec;
  queueMessage: typeof queueMessageSpec;
  terminateAllVats: typeof terminateAllVatsSpec;
  collectGarbage: typeof collectGarbageSpec;
  terminateVat: typeof terminateVatSpec;
  launchSubcluster: typeof launchSubclusterSpec;
  terminateSubcluster: typeof terminateSubclusterSpec;
};

type Handlers = (typeof rpcHandlers)[keyof typeof rpcHandlers];

export type KernelControlMethod = Handlers['method'];
