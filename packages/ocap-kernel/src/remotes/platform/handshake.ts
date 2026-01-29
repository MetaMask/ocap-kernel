import { Logger } from '@metamask/logger';
import { toString as bufToString, fromString } from 'uint8arrays';

import { writeWithTimeout } from './channel-utils.ts';
import { DEFAULT_WRITE_TIMEOUT_MS } from './constants.ts';
import type { Channel } from '../types.ts';

/**
 * Handshake timeout in milliseconds.
 */
const HANDSHAKE_TIMEOUT_MS = 10_000;

/**
 * Type for handshake protocol messages exchanged during connection establishment.
 */
export type HandshakeMessage =
  | { method: 'handshake'; params: { incarnationId: string } }
  | { method: 'handshakeAck'; params: { incarnationId: string } };

/**
 * Result of a handshake operation.
 */
export type HandshakeResult = {
  /** The remote peer's incarnation ID. */
  remoteIncarnationId: string;
  /** Whether the incarnation changed from a previously known value. */
  incarnationChanged: boolean;
};

/**
 * Dependencies for the handshake handler.
 */
export type HandshakeDeps = {
  /** This kernel's incarnation ID. */
  localIncarnationId: string;
  /** Logger for diagnostic output. */
  logger: Logger;
  /** Set the incarnation ID for a peer. Returns true if it changed. */
  setRemoteIncarnation: (peerId: string, incarnationId: string) => boolean;
};

/**
 * Check if a parsed message is a handshake protocol message.
 *
 * @param parsed - The parsed message object.
 * @returns True if this is a handshake or handshakeAck message.
 */
export function isHandshakeMessage(
  parsed: unknown,
): parsed is HandshakeMessage {
  if (typeof parsed !== 'object' || parsed === null) {
    return false;
  }
  const candidate = parsed as Record<string, unknown>;
  if (candidate.method !== 'handshake' && candidate.method !== 'handshakeAck') {
    return false;
  }
  // Validate params.incarnationId exists and is a string
  const params = candidate.params as Record<string, unknown> | undefined;
  return typeof params?.incarnationId === 'string';
}

/**
 * Read a message from a channel with timeout.
 *
 * @param channel - The channel to read from.
 * @param timeoutMs - Timeout in milliseconds.
 * @returns The message string.
 */
async function readWithTimeout(
  channel: Channel,
  timeoutMs: number,
): Promise<string> {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);

  // Create abort handler as named function so we can remove it in finally
  let rejectTimeout: (error: Error) => void;
  const abortHandler = (): void => {
    rejectTimeout(new Error('Handshake read timed out'));
  };

  // Create a promise that rejects on timeout
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    rejectTimeout = reject;
    abortController.signal.addEventListener('abort', abortHandler);
  });

  const readPromise = (async () => {
    const readBuf = await channel.msgStream.read();
    if (!readBuf) {
      throw new Error('Channel closed during handshake');
    }
    return bufToString(readBuf.subarray());
  })();

  try {
    return await Promise.race([readPromise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
    abortController.signal.removeEventListener('abort', abortHandler);
  }
}

/**
 * Perform handshake as the initiator (outbound connection).
 * Sends handshake message and waits for handshakeAck.
 *
 * @param channel - The channel to perform handshake on.
 * @param deps - Handshake dependencies.
 * @returns The handshake result, or undefined if handshake is not configured.
 */
export async function performOutboundHandshake(
  channel: Channel,
  deps: HandshakeDeps,
): Promise<HandshakeResult> {
  const { localIncarnationId, logger, setRemoteIncarnation } = deps;
  const { peerId } = channel;
  const shortPeerId = peerId.slice(0, 8);
  const shortIncarnation = localIncarnationId.slice(0, 8);

  // Send handshake
  const handshakeMsg: HandshakeMessage = {
    method: 'handshake',
    params: { incarnationId: localIncarnationId },
  };
  logger.log(
    `${shortPeerId}:: sending handshake with incarnation ${shortIncarnation}`,
  );
  await writeWithTimeout(
    channel,
    fromString(JSON.stringify(handshakeMsg)),
    DEFAULT_WRITE_TIMEOUT_MS,
  );

  // Wait for handshakeAck
  logger.log(`${shortPeerId}:: waiting for handshakeAck`);
  const response = await readWithTimeout(channel, HANDSHAKE_TIMEOUT_MS);
  const parsed = JSON.parse(response);

  if (!isHandshakeMessage(parsed) || parsed.method !== 'handshakeAck') {
    throw new Error(
      `Expected handshakeAck, got: ${parsed?.method ?? 'unknown'}`,
    );
  }

  const remoteIncarnationId = parsed.params.incarnationId;
  logger.log(
    `${shortPeerId}:: received handshakeAck with incarnation ${remoteIncarnationId.slice(0, 8)}`,
  );

  const incarnationChanged = setRemoteIncarnation(peerId, remoteIncarnationId);

  return { remoteIncarnationId, incarnationChanged };
}

/**
 * Perform handshake as the responder (inbound connection).
 * Waits for handshake message and sends handshakeAck.
 *
 * @param channel - The channel to perform handshake on.
 * @param deps - Handshake dependencies.
 * @returns The handshake result, or undefined if handshake is not configured.
 */
export async function performInboundHandshake(
  channel: Channel,
  deps: HandshakeDeps,
): Promise<HandshakeResult> {
  const { localIncarnationId, logger, setRemoteIncarnation } = deps;
  const { peerId } = channel;
  const shortPeerId = peerId.slice(0, 8);

  // Wait for handshake
  logger.log(`${shortPeerId}:: waiting for handshake`);
  const message = await readWithTimeout(channel, HANDSHAKE_TIMEOUT_MS);
  const parsed = JSON.parse(message);

  if (!isHandshakeMessage(parsed) || parsed.method !== 'handshake') {
    throw new Error(`Expected handshake, got: ${parsed?.method ?? 'unknown'}`);
  }

  const remoteIncarnationId = parsed.params.incarnationId;
  logger.log(
    `${shortPeerId}:: received handshake with incarnation ${remoteIncarnationId.slice(0, 8)}`,
  );

  // Send handshakeAck
  const ackMsg: HandshakeMessage = {
    method: 'handshakeAck',
    params: { incarnationId: localIncarnationId },
  };
  logger.log(
    `${shortPeerId}:: sending handshakeAck with incarnation ${localIncarnationId.slice(0, 8)}`,
  );
  await writeWithTimeout(
    channel,
    fromString(JSON.stringify(ackMsg)),
    DEFAULT_WRITE_TIMEOUT_MS,
  );

  const incarnationChanged = setRemoteIncarnation(peerId, remoteIncarnationId);

  return { remoteIncarnationId, incarnationChanged };
}
