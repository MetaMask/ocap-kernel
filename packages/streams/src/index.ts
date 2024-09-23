export {
  initializeMessageChannel,
  receiveMessagePort,
} from './message-channel.js';
export type { StreamPair, Reader, Writer } from './streams.js';
export { makeMessagePortStreamPair } from './streams.js';
export { makeStreamEnvelopeKit } from './envelope-kit.js';
