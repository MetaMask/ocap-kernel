export type { Reader, Writer } from './utils.ts';
export type { DuplexStream } from './BaseDuplexStream.ts';
export {
  NodeWorkerReader,
  NodeWorkerWriter,
  NodeWorkerDuplexStream,
} from './node/NodeWorkerStream.ts';
export { split } from './split.ts';
export { makeEventualIterator } from './vat/eventual-iterator.ts';
export { makeFarGenerator } from './vat/far-generator.ts';
