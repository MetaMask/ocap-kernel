import { getBaseMethods } from './base.ts';
import type { RemoteId, RemoteInfo } from '../../types.ts';
import type { StoreContext } from '../types.ts';

export type RemoteRecord = {
  remoteId: RemoteId;
  remoteInfo: RemoteInfo;
};

const REMOTE_INFO_BASE = 'remote.';
const REMOTE_INFO_BASE_LEN = REMOTE_INFO_BASE.length;

/**
 * Get a kernel store object that provides functionality for managing remote records.
 *
 * @param ctx - The store context.
 * @returns A vat store object that maps various persistent kernel data
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function getRemoteMethods(ctx: StoreContext) {
  const { kv } = ctx;
  const { getPrefixedKeys } = getBaseMethods(ctx.kv);

  /**
   * Generator that yields the info about active remotes.
   *
   * @yields a series of remote records for all active remotes.
   */
  function* getAllRemoteRecords(): Generator<RemoteRecord> {
    for (const remoteKey of getPrefixedKeys(REMOTE_INFO_BASE)) {
      const remoteId = remoteKey.slice(REMOTE_INFO_BASE_LEN);
      const remoteInfo = getRemoteInfo(remoteId);
      yield { remoteId, remoteInfo };
    }
  }

  /**
   * Fetch the stored info about a remote.
   *
   * @param remoteId - The remote whose info is sought.
   *
   * @returns the info for the given remote.
   */
  function getRemoteInfo(remoteId: RemoteId): RemoteInfo {
    return JSON.parse(
      kv.getRequired(`${REMOTE_INFO_BASE}${remoteId}`),
    ) as RemoteInfo;
  }

  /**
   * Store the info for a remote.
   *
   * @param remoteID - The remote whose info is to be set.
   * @param remoteInfo - The info to write.
   */
  function setRemoteInfo(remoteID: RemoteId, remoteInfo: RemoteInfo): void {
    kv.set(`${REMOTE_INFO_BASE}${remoteID}`, JSON.stringify(remoteInfo));
  }

  /**
   * Delete the info for a remote.
   *
   * @param remoteID - The remote whose info is to be removed.
   */
  function deleteRemoteInfo(remoteID: RemoteId): void {
    kv.delete(`${REMOTE_INFO_BASE}${remoteID}`);
  }

  return {
    getAllRemoteRecords,
    getRemoteInfo,
    setRemoteInfo,
    deleteRemoteInfo,
  };
}
