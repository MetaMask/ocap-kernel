export {
  initializeMessageChannel,
  receiveMessagePort,
} from './message-channel.js';
export type { StreamPair, Reader, Writer } from './streams.js';
export { makeMessagePortStreamPair } from './streams.js';
export { makeStreamEnvelopeKit } from './envelope-kit.js';
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
