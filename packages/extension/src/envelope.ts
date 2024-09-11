import { isObject } from '@metamask/utils';

import type { WrappedIframeMessage } from './message.js';
import { isWrappedIframeMessage } from './message.js';

export enum EnvelopeLabel {
  Command = 'message',
  CapTp = 'capTp',
}

export type StreamEnvelope =
  | {
      label: EnvelopeLabel.Command;
      content: WrappedIframeMessage;
    }
  | { label: EnvelopeLabel.CapTp; content: unknown };

export const isStreamEnvelope = (value: unknown): value is StreamEnvelope =>
  isObject(value) &&
  (value.label === EnvelopeLabel.CapTp ||
    (value.label === EnvelopeLabel.Command &&
      isWrappedIframeMessage(value.content)));
