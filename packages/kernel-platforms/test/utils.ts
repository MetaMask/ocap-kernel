/**
 * A regular expression that matches Superstruct validation errors.
 */
export const superstructValidationError = /At path: .* -- Expected/u;

/**
 * Creates a mock Response object for testing
 *
 * @returns A mock Response object
 */

export const createMockResponse = (): Response =>
  ({
    status: 200,
    text: async () => Promise.resolve('test'),
  }) as Response;
