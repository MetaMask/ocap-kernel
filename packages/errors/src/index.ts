export { ErrorCode } from './constants.js';
export {
  VatCapTpConnectionExistsError,
  VatCapTpConnectionNotFoundError,
  VatAlreadyExistsError,
  VatDeletedError,
  VatNotFoundError,
  StreamReadError,
} from './errors.js';
export { toError } from './utils/toError.js';
export { isCodedError } from './utils/isCodedError.js';
export { isOcapError } from './utils/isOcapError.js';
