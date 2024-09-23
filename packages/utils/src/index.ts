export type {
  CapTpMessage,
  CapTpPayload,
  MessageId,
  VatMessage,
  KernelMessage,
  WrappedVatMessage,
} from './types.js';
export { KernelMessageTarget, Command } from './types.js';
export {
  wrapStreamCommand,
  wrapCapTp,
  makeStreamEnvelopeHandler,
  type StreamEnvelope,
  type StreamEnvelopeHandler,
} from './stream-envelope.js';
