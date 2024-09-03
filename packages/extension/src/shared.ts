import { isObject } from '@metamask/utils';

export type VatId = string;
export type MessageId = string;

export enum Command {
  CapTpCall = 'callCapTp',
  CapTpInit = 'makeCapTp',
  Evaluate = 'evaluate',
  Ping = 'ping',
}

export type ExtensionMessage<
  Type extends Command,
  Data extends null | string | unknown[] | Record<string, unknown>,
> = {
  type: Type;
  target: 'background' | 'offscreen';
  data: Data;
};

export type IframeMessage<
  Type extends Command,
  Data extends null | string | unknown[] | Record<string, unknown>,
> = {
  type: Type;
  data: Data;
};

export type WrappedIframeMessage = {
  id: MessageId;
  message: IframeMessage<Command, string | null>;
};

export const isWrappedIframeMessage = (
  value: unknown,
): value is WrappedIframeMessage =>
  isObject(value) &&
  typeof value.id === 'string' &&
  isObject(value.message) &&
  typeof value.message.type === 'string' &&
  (typeof value.message.data === 'string' || value.message.data === null);

export type StreamPayloadEnvelope =
  | {
      label: 'message';
      payload: WrappedIframeMessage;
    }
  | { label: 'capTp'; payload: unknown };

type MessageHandler = (message: WrappedIframeMessage) => void | Promise<void>;
type CapTpHandler = (capTpMessage: unknown) => void | Promise<void>;
export const makeEnvelopeUnwrapper =
  (handleMessage: MessageHandler, handleCapTp: CapTpHandler) =>
  async (envelope: StreamPayloadEnvelope): Promise<void> => {
    switch (envelope.label) {
      case 'capTp':
        return handleCapTp(envelope.payload);
      case 'message':
        return handleMessage(envelope.payload);
      default:
        throw new Error(
          `Unexpected message label in message:\n${JSON.stringify(
            envelope,
            null,
            2,
          )}`,
        );
    }
  };

export const isStreamPayloadEnvelope = (
  value: unknown,
): value is StreamPayloadEnvelope => {
  if (!isObject(value)) {
    return false;
  }
  if (
    value.label !== 'capTp' &&
    (value.label !== 'message' || !isWrappedIframeMessage(value.payload))
  ) {
    return false;
  }
  return true;
};

/**
 * Wrap an async callback to ensure any errors are at least logged.
 *
 * @param callback - The async callback to wrap.
 * @returns The wrapped callback.
 */
export const makeHandledCallback = <Args extends unknown[]>(
  callback: (...args: Args) => Promise<void>,
) => {
  return (...args: Args): void => {
    // eslint-disable-next-line n/no-callback-literal, n/callback-return
    callback(...args).catch(console.error);
  };
};
