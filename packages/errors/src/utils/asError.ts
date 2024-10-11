/**
 * Coerce an unknown problem into an Error object.
 *
 * @param problem - Whatever was caught.
 * @returns The problem if it is an Error, or a new Error with the problem as the cause.
 */
export function asError(problem: unknown): Error {
  return problem instanceof Error
    ? problem
    : new Error('Unknown', { cause: problem });
}
