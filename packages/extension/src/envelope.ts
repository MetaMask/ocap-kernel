import { isObject } from '@metamask/utils';

import type { WrappedIframeMessage } from './message.js';
import { isWrappedIframeMessage } from './message.js';

export enum EnvelopeLabel {
  Command = 'message',
  CapTp = 'capTp',
}

export type StreamPayloadEnvelope =
  | {
      label: EnvelopeLabel.Command;
      payload: WrappedIframeMessage;
    }
  | { label: EnvelopeLabel.CapTp; payload: unknown };

/*
type MessageHandler = (message: WrappedIframeMessage) => void | Promise<void>;
type CapTpHandler = (capTpMessage: unknown) => void | Promise<void>;
export const makeEnvelopeUnwrapper =
  (handleMessage: MessageHandler, handleCapTp: CapTpHandler) =>
  async (envelope: StreamPayloadEnvelope): Promise<void> => {
    switch (envelope.label) {
      case EnvelopeLabel.CapTp:
        return handleCapTp(envelope.payload);
      case EnvelopeLabel.Command:
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
  */

export const isStreamPayloadEnvelope = (
  value: unknown,
): value is StreamPayloadEnvelope =>
  isObject(value) &&
  (value.label === EnvelopeLabel.CapTp ||
    (value.label === EnvelopeLabel.Command &&
      isWrappedIframeMessage(value.payload)));
