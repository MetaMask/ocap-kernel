import type { TestOptions } from 'vitest';

/**
 * The default number of retries for a flaky test.
 */
export const DEFAULT_RETRIES = 3;

/**
 * Mark a test as flaky.
 *
 * @param testOptions - The test options.
 * @returns The test options.
 */
export function flaky(
  testOptions: TestOptions,
): TestOptions & { retry: number } {
  return {
    ...testOptions,
    retry: testOptions.retry ?? DEFAULT_RETRIES,
  };
}
