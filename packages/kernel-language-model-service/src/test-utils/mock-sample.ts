import type { SampleParams, SampleResult } from '../types.ts';

/**
 * Returns a sample function that returns a sequence of result texts (one per call).
 *
 * @param responses - Text strings to return, in order, for each call.
 * @returns A function matching the sample service signature.
 */
export const makeMockSample = (
  responses: string[],
): ((params: SampleParams) => Promise<SampleResult>) => {
  let idx = 0;
  return async (_params) => {
    const text = responses[idx] ?? '';
    idx += 1;
    return harden({ text });
  };
};
