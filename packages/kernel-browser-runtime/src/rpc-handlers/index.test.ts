import { describe, it, expect } from 'vitest';

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
import { rpcHandlers, rpcMethodSpecs } from './index.ts';
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

describe('handlers/index', () => {
  it('should export all handler functions', () => {
    expect(rpcHandlers).toStrictEqual({
      clearState: clearStateHandler,
      evaluateVat: evaluateVatHandler,
      executeDBQuery: executeDBQueryHandler,
      getStatus: getStatusHandler,
      pingVat: pingVatHandler,
      reload: reloadConfigHandler,
      restartVat: restartVatHandler,
      revoke: revokeHandler,
      isRevoked: isRevokedHandler,
      queueMessage: queueMessageHandler,
      terminateAllVats: terminateAllVatsHandler,
      collectGarbage: collectGarbageHandler,
      terminateVat: terminateVatHandler,
      launchSubcluster: launchSubclusterHandler,
      reloadSubcluster: reloadSubclusterHandler,
      terminateSubcluster: terminateSubclusterHandler,
    });
  });

  it('should have all handlers with the correct method property', () => {
    const handlerEntries = Object.entries(rpcHandlers);

    handlerEntries.forEach(([key, handler]) => {
      expect(handler).toHaveProperty('method');
      expect(handler.method).toBe(key);
    });
  });

  it('should export all method specs', () => {
    expect(rpcMethodSpecs).toStrictEqual({
      clearState: clearStateSpec,
      evaluateVat: evaluateVatSpec,
      executeDBQuery: executeDBQuerySpec,
      getStatus: getStatusSpec,
      pingVat: pingVatSpec,
      reload: reloadConfigSpec,
      restartVat: restartVatSpec,
      revoke: revokeSpec,
      isRevoked: isRevokedSpec,
      queueMessage: queueMessageSpec,
      terminateAllVats: terminateAllVatsSpec,
      collectGarbage: collectGarbageSpec,
      terminateVat: terminateVatSpec,
      launchSubcluster: launchSubclusterSpec,
      reloadSubcluster: reloadSubclusterSpec,
      terminateSubcluster: terminateSubclusterSpec,
    });
  });

  it('should have the same keys as handlers', () => {
    expect(Object.keys(rpcMethodSpecs).sort()).toStrictEqual(
      Object.keys(rpcHandlers).sort(),
    );
  });
});
