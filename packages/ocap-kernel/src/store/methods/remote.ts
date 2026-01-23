import { getBaseMethods } from './base.ts';
import type { RemoteInfo } from '../../remotes/types.ts';
import type { RemoteId } from '../../types.ts';
import type { StoreContext } from '../types.ts';

export type RemoteRecord = {
  remoteId: RemoteId;
  remoteInfo: RemoteInfo;
};

/**
 * Sequence tracking state for a remote.
 */
export type RemoteSeqState = {
  nextSendSeq: number;
  highestReceivedSeq: number;
  startSeq: number;
};

const REMOTE_INFO_BASE = 'remote.';
const REMOTE_INFO_BASE_LEN = REMOTE_INFO_BASE.length;
const REMOTE_SEQ_BASE = 'remoteSeq.';
const REMOTE_PENDING_BASE = 'remotePending.';

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
    deleteRemotePendingState(remoteID);
  }

  // --- Sequence/ACK persistence methods ---

  /**
   * Get the sequence tracking state for a remote.
   *
   * @param remoteId - The remote whose seq state is sought.
   * @returns The seq state, or undefined if not yet persisted.
   */
  function getRemoteSeqState(remoteId: RemoteId): RemoteSeqState | undefined {
    const prefix = `${REMOTE_SEQ_BASE}${remoteId}.`;
    const nextSendSeqStr = kv.get(`${prefix}nextSendSeq`);
    const highestReceivedSeqStr = kv.get(`${prefix}highestReceivedSeq`);
    const startSeqStr = kv.get(`${prefix}startSeq`);

    // If none of the keys exist, there's no persisted state
    if (
      nextSendSeqStr === undefined &&
      highestReceivedSeqStr === undefined &&
      startSeqStr === undefined
    ) {
      return undefined;
    }

    return {
      nextSendSeq: nextSendSeqStr === undefined ? 0 : Number(nextSendSeqStr),
      highestReceivedSeq:
        highestReceivedSeqStr === undefined ? 0 : Number(highestReceivedSeqStr),
      startSeq: startSeqStr === undefined ? 0 : Number(startSeqStr),
    };
  }

  /**
   * Set the next outgoing sequence number for a remote.
   *
   * @param remoteId - The remote whose state is to be updated.
   * @param value - The value to set.
   */
  function setRemoteNextSendSeq(remoteId: RemoteId, value: number): void {
    kv.set(`${REMOTE_SEQ_BASE}${remoteId}.nextSendSeq`, String(value));
  }

  /**
   * Set the highest received sequence number for a remote.
   *
   * @param remoteId - The remote whose state is to be updated.
   * @param value - The value to set.
   */
  function setRemoteHighestReceivedSeq(
    remoteId: RemoteId,
    value: number,
  ): void {
    kv.set(`${REMOTE_SEQ_BASE}${remoteId}.highestReceivedSeq`, String(value));
  }

  /**
   * Set the start sequence number (first pending message) for a remote.
   *
   * @param remoteId - The remote whose state is to be updated.
   * @param value - The value to set.
   */
  function setRemoteStartSeq(remoteId: RemoteId, value: number): void {
    kv.set(`${REMOTE_SEQ_BASE}${remoteId}.startSeq`, String(value));
  }

  /**
   * Get a pending message by remote and sequence number.
   *
   * @param remoteId - The remote to get the message for.
   * @param seq - The sequence number of the message.
   * @returns The pending message string, or undefined if not found.
   */
  function getPendingMessage(
    remoteId: RemoteId,
    seq: number,
  ): string | undefined {
    const key = `${REMOTE_PENDING_BASE}${remoteId}.${seq}`;
    return kv.get(key);
  }

  /**
   * Store a pending message.
   *
   * @param remoteId - The remote to store the message for.
   * @param seq - The sequence number of the message.
   * @param messageString - The serialized message to store.
   */
  function setPendingMessage(
    remoteId: RemoteId,
    seq: number,
    messageString: string,
  ): void {
    const key = `${REMOTE_PENDING_BASE}${remoteId}.${seq}`;
    kv.set(key, messageString);
  }

  /**
   * Delete a pending message entry.
   *
   * @param remoteId - The remote to delete the message for.
   * @param seq - The sequence number of the message to delete.
   */
  function deletePendingMessage(remoteId: RemoteId, seq: number): void {
    const key = `${REMOTE_PENDING_BASE}${remoteId}.${seq}`;
    kv.delete(key);
  }

  /**
   * Delete all pending state for a remote (seq state + all pending messages).
   * Called when a remote relationship is terminated.
   *
   * @param remoteId - The remote whose pending state is to be deleted.
   */
  function deleteRemotePendingState(remoteId: RemoteId): void {
    // Delete seq state
    const seqPrefix = `${REMOTE_SEQ_BASE}${remoteId}.`;
    kv.delete(`${seqPrefix}nextSendSeq`);
    kv.delete(`${seqPrefix}highestReceivedSeq`);
    kv.delete(`${seqPrefix}startSeq`);

    // Delete all pending messages
    const pendingPrefix = `${REMOTE_PENDING_BASE}${remoteId}.`;
    for (const key of getPrefixedKeys(pendingPrefix)) {
      kv.delete(key);
    }
  }

  /**
   * Delete orphan pending messages (messages with seq < startSeq).
   * Called during recovery to clean up messages left behind by crashes
   * during ACK processing.
   *
   * @param remoteId - The remote whose orphans are to be cleaned.
   * @param startSeq - The current start sequence; messages below this are orphans.
   * @returns The number of orphan messages deleted.
   */
  function cleanupOrphanMessages(remoteId: RemoteId, startSeq: number): number {
    const pendingPrefix = `${REMOTE_PENDING_BASE}${remoteId}.`;
    const prefixLen = pendingPrefix.length;
    let deletedCount = 0;

    for (const key of getPrefixedKeys(pendingPrefix)) {
      const seq = Number(key.slice(prefixLen));
      if (seq < startSeq) {
        kv.delete(key);
        deletedCount += 1;
      }
    }

    return deletedCount;
  }

  return {
    getAllRemoteRecords,
    getRemoteInfo,
    setRemoteInfo,
    deleteRemoteInfo,
    // Sequence/ACK persistence
    getRemoteSeqState,
    setRemoteNextSendSeq,
    setRemoteHighestReceivedSeq,
    setRemoteStartSeq,
    getPendingMessage,
    setPendingMessage,
    deletePendingMessage,
    deleteRemotePendingState,
    cleanupOrphanMessages,
  };
}
