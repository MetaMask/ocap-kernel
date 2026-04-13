import type { EvaluatedSection, Lift, LiftContext } from './types.ts';

/**
 * Drive a lift coroutine, retrying on failure and accumulating errors.
 *
 * Primes the generator with gen.next([]), then calls gen.next(errors) after
 * each failed attempt where errors is the full ordered history. Returns the
 * first successful result, or rethrows the last error when exhausted.
 *
 * @param lift - The lift coroutine to drive.
 * @param germs - The evaluated sections to pass to the lift.
 * @param context - The dispatch context (method, args, constraints).
 * @param invoke - Calls the section exo; throws on failure.
 * @returns The result of the first successful invocation.
 * @internal
 */
export const driveLift = async <M extends Record<string, unknown>>(
  lift: Lift<M>,
  germs: EvaluatedSection<Partial<M>>[],
  context: LiftContext<M>,
  invoke: (germ: EvaluatedSection<Partial<M>>) => Promise<unknown>,
): Promise<unknown> => {
  const errors: unknown[] = [];
  const gen = lift(germs, context);
  let next = await gen.next(errors);
  while (!next.done) {
    try {
      const result = await invoke(next.value);
      await gen.return(undefined);
      return result;
    } catch (error) {
      errors.push(error);
      next = await gen.next(errors);
    }
  }
  const lastError = errors.at(-1);
  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error(`No viable section for ${context.method}`, {
    cause: lastError,
  });
};
