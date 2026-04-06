import { describe, it, expect } from 'vitest';

import * as indexModule from './index.ts';

describe('index', () => {
  it('has the expected exports', () => {
    expect(Object.keys(indexModule).sort()).toStrictEqual([
      'AbortError',
      'DuplicateEndowmentError',
      'ErrorCode',
      'ErrorSentinel',
      'ErrorStruct',
      'EvaluatorError',
      'KERNEL_ERROR_PATTERN',
      'MarshaledErrorStruct',
      'MarshaledOcapErrorStruct',
      'ResourceLimitError',
      'SampleGenerationError',
      'StreamReadError',
      'SubclusterNotFoundError',
      'VatAlreadyExistsError',
      'VatDeletedError',
      'VatNotFoundError',
      'getKernelErrorCode',
      'getNetworkErrorCode',
      'isFatalKernelError',
      'isKernelError',
      'isMarshaledError',
      'isMarshaledOcapError',
      'isOcapError',
      'isResourceLimitError',
      'isRetryableNetworkError',
      'marshalError',
      'toError',
      'unmarshalError',
    ]);
  });
});
