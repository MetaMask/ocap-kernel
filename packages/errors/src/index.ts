export type { OcapError } from './types.js';
export { ErrorCode } from './types.js';
export {
  VatCapTpConnectionExistsError,
  VatCapTpConnectionNotFoundError,
  VatAlreadyExistsError,
  VatDeletedError,
  VatNotFoundError,
  StreamReadError,
} from './errors.js';
export { toError } from './utils/toError.js';
export { isOcapError } from './utils/isOcapError.js';
