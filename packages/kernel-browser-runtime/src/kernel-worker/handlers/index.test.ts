import { describe, it, expect } from 'vitest';

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
import { handlers, methodSpecs } from './index.ts';
import { launchVatHandler, launchVatSpec } from './launch-vat.ts';
import { pingVatHandler, pingVatSpec } from './ping-vat.ts';
import { queueMessageHandler, queueMessageSpec } from './queue-message.ts';
import { reloadConfigHandler, reloadConfigSpec } from './reload-config.ts';
import { restartVatHandler, restartVatSpec } from './restart-vat.ts';
import {
  terminateAllVatsHandler,
  terminateAllVatsSpec,
} from './terminate-all-vats.ts';
import { terminateVatHandler, terminateVatSpec } from './terminate-vat.ts';
import {
  updateClusterConfigHandler,
  updateClusterConfigSpec,
} from './update-cluster-config.ts';

describe('handlers/index', () => {
  it('should export all handler functions', () => {
    expect(handlers).toStrictEqual({
      clearState: clearStateHandler,
      executeDBQuery: executeDBQueryHandler,
      getStatus: getStatusHandler,
      launchVat: launchVatHandler,
      pingVat: pingVatHandler,
      reload: reloadConfigHandler,
      restartVat: restartVatHandler,
      queueMessage: queueMessageHandler,
      terminateAllVats: terminateAllVatsHandler,
      collectGarbage: collectGarbageHandler,
      terminateVat: terminateVatHandler,
      updateClusterConfig: updateClusterConfigHandler,
    });
  });

  it('should have all handlers with the correct method property', () => {
    const handlerEntries = Object.entries(handlers);

    handlerEntries.forEach(([key, handler]) => {
      expect(handler).toHaveProperty('method');
      expect(handler.method).toBe(key);
    });
  });

  it('should export all method specs', () => {
    expect(methodSpecs).toStrictEqual({
      clearState: clearStateSpec,
      executeDBQuery: executeDBQuerySpec,
      getStatus: getStatusSpec,
      launchVat: launchVatSpec,
      pingVat: pingVatSpec,
      reload: reloadConfigSpec,
      restartVat: restartVatSpec,
      queueMessage: queueMessageSpec,
      terminateAllVats: terminateAllVatsSpec,
      collectGarbage: collectGarbageSpec,
      terminateVat: terminateVatSpec,
      updateClusterConfig: updateClusterConfigSpec,
    });
  });

  it('should have the same keys as handlers', () => {
    expect(Object.keys(methodSpecs).sort()).toStrictEqual(
      Object.keys(handlers).sort(),
    );
  });
});
