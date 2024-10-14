export type { OcapError } from './types.js';
export { ErrorCode } from './types.js';
export {
  VatCapTpConnectionExistsError,
  VatCapTpConnectionNotFoundError,
  SupervisorReadError,
  VatAlreadyExistsError,
  VatDeletedError,
  VatNotFoundError,
  VatReadError,
} from './errors.js';
export { toError } from './utils/toError.js';
export { isOcapError } from './utils/isOcapError.js';
