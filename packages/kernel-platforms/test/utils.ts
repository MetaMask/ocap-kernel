/**
 * A regular expression that matches Superstruct validation errors.
 */
export const superstructValidationError = /At path: .* -- Expected/u;

/**
 * Creates a mock Response object for testing
 *
 * @returns A mock Response object
 */
// eslint-disable-next-line n/no-unsupported-features/node-builtins
export const createMockResponse = (): Response =>
  ({
    status: 200,
    text: async () => Promise.resolve('test'),
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
  }) as Response;
