import { AbortError } from './AbortError.ts';
import { ChannelResetError } from './ChannelResetError.ts';
import { DuplicateEndowmentError } from './DuplicateEndowmentError.ts';
import { EvaluatorError } from './EvaluatorError.ts';
import { IntentionalCloseError } from './IntentionalCloseError.ts';
import { IntentionalDisconnectError } from './IntentionalDisconnectError.ts';
import { MessageTooLargeError } from './MessageTooLargeError.ts';
import { NetworkStoppedError } from './NetworkStoppedError.ts';
import { PeerRestartedError } from './PeerRestartedError.ts';
import { ResourceLimitError } from './ResourceLimitError.ts';
import { SampleGenerationError } from './SampleGenerationError.ts';
import { StreamReadError } from './StreamReadError.ts';
import { VatAlreadyExistsError } from './VatAlreadyExistsError.ts';
import { VatDeletedError } from './VatDeletedError.ts';
import { VatNotFoundError } from './VatNotFoundError.ts';
import { ErrorCode } from '../constants.ts';
import { SubclusterNotFoundError } from './SubclusterNotFoundError.ts';

export const errorClasses = {
  [ErrorCode.AbortError]: AbortError,
  [ErrorCode.DuplicateEndowment]: DuplicateEndowmentError,
  [ErrorCode.StreamReadError]: StreamReadError,
  [ErrorCode.VatAlreadyExists]: VatAlreadyExistsError,
  [ErrorCode.VatDeleted]: VatDeletedError,
  [ErrorCode.VatNotFound]: VatNotFoundError,
  [ErrorCode.SubclusterNotFound]: SubclusterNotFoundError,
  [ErrorCode.SampleGenerationError]: SampleGenerationError,
  [ErrorCode.InternalError]: EvaluatorError,
  [ErrorCode.ResourceLimitError]: ResourceLimitError,
  [ErrorCode.PeerRestartedError]: PeerRestartedError,
  [ErrorCode.IntentionalCloseError]: IntentionalCloseError,
  [ErrorCode.NetworkStoppedError]: NetworkStoppedError,
  [ErrorCode.ChannelResetError]: ChannelResetError,
  [ErrorCode.IntentionalDisconnectError]: IntentionalDisconnectError,
  [ErrorCode.MessageTooLargeError]: MessageTooLargeError,
} as const;
