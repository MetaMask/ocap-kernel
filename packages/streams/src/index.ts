export type { Reader, Writer } from './utils.ts';
export type { DuplexStream } from './BaseDuplexStream.ts';
export {
  NodeWorkerReader,
  NodeWorkerWriter,
  NodeWorkerDuplexStream,
} from './node/NodeWorkerStream.ts';
export {
  NodeSocketReader,
  NodeSocketWriter,
  NodeSocketDuplexStream,
} from './node/NodeSocketStream.ts';
export type { NetSocket } from './node/NodeSocketStream.ts';
export { split } from './split.ts';
