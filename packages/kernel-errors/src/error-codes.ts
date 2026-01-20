/**
 * Enum defining all error codes for Ocap errors.
 */
export const ErrorCode = {
  AbortError: 'ABORT_ERROR',
  DuplicateEndowment: 'DUPLICATE_ENDOWMENT',
  StreamReadError: 'STREAM_READ_ERROR',
  VatAlreadyExists: 'VAT_ALREADY_EXISTS',
  VatDeleted: 'VAT_DELETED',
  VatNotFound: 'VAT_NOT_FOUND',
  SubclusterNotFound: 'SUBCLUSTER_NOT_FOUND',
  SampleGenerationError: 'SAMPLE_GENERATION_ERROR',
  InternalError: 'INTERNAL_ERROR',
  ResourceLimitError: 'RESOURCE_LIMIT_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * A sentinel value used to identify marshaled errors.
 */
export const ErrorSentinel = '@@MARSHALED_ERROR';

/**
 * Type guard to check if an error is a SampleGenerationError.
 * Uses error code checking instead of instanceof to work across
 * package boundaries where different class objects may be used.
 *
 * @param error - The error to check.
 * @returns True if the error has the SampleGenerationError code.
 */
export const isSampleGenerationError = (
  error: unknown,
): error is Error & {
  code: typeof ErrorCode.SampleGenerationError;
  data: { sample: string };
} => {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === ErrorCode.SampleGenerationError
  );
};
