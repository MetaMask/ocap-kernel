export type { OcapError, MarshaledError } from './types.ts';
export { VatAlreadyExistsError } from './errors/VatAlreadyExistsError.ts';
export { VatDeletedError } from './errors/VatDeletedError.ts';
export { VatNotFoundError } from './errors/VatNotFoundError.ts';
export { StreamReadError } from './errors/StreamReadError.ts';
export {
  ErrorCode,
  ErrorSentinel,
  ErrorStruct,
  MarshaledErrorStruct,
  MarshaledOcapErrorStruct,
} from './constants.ts';
export { toError } from './utils/toError.ts';
export { isOcapError } from './utils/isOcapError.ts';
export { marshalError } from './marshal/marshalError.ts';
export { unmarshalError } from './marshal/unmarshalError.ts';
export { isMarshaledError } from './marshal/isMarshaledError.ts';
export { isMarshaledOcapError } from './marshal/isMarshaledOcapError.ts';
