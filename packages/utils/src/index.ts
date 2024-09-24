export type {
  CapTpMessage,
  CapTpPayload,
  Command,
  CommandReply,
  VatMessage,
} from './types.js';
export { CommandMethod } from './types.js';
export { isCommand } from './type-guards.js';
export {
  wrapStreamCommand,
  wrapCapTp,
  makeStreamEnvelopeHandler,
  type StreamEnvelope,
  type StreamEnvelopeHandler,
} from './stream-envelope.js';
