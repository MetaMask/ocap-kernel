export type {
  CapTpMessage,
  CapTpPayload,
  Command,
  VatMessage,
} from './types.js';
export { CommandType } from './types.js';
export { isCommand } from './type-guards.js';
export {
  wrapStreamCommand,
  wrapCapTp,
  makeStreamEnvelopeHandler,
  type StreamEnvelope,
  type StreamEnvelopeHandler,
} from './stream-envelope.js';
