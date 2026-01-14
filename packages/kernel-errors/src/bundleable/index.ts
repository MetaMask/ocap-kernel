/**
 * Bundleable versions of kernel-errors.
 *
 * These versions do not include marshaling logic to avoid dependencies
 * on @metamask/utils that prevent vat bundling with @endo/bundle-source.
 *
 * Use these exports when bundling vat code:
 * import { SampleGenerationError } from '@metamask/kernel-errors/bundleable';
 */
export { SampleGenerationError } from './SampleGenerationError.ts';
export { ErrorCode, ErrorSentinel } from '../error-codes.ts';
