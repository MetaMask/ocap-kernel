export type {
  CapTpMessage,
  CapTpPayload,
  Command,
  CommandReply,
  VatCommand,
  VatCommandReply,
} from './types.js';
export { CommandMethod } from './types.js';
export { isCommand, isCommandReply } from './type-guards.js';
export {
  wrapStreamCommand,
  wrapCapTp,
  makeStreamEnvelopeHandler,
  type StreamEnvelope,
  type StreamEnvelopeHandler,
  wrapStreamCommandReply,
  makeStreamEnvelopeReplyHandler,
  type StreamEnvelopeReply,
  type StreamEnvelopeReplyHandler,
} from './stream-envelope.js';
