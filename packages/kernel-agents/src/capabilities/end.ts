import { ifDefined } from '../utils.ts';
import { capability } from './capability.ts';

/**
 * A factory function to make a task's `end` capability, which stores the first
 * invocation as the final result and ignores all subsequent invocations.
 *
 * @template Result - The expected type of the final result.
 * @returns A tuple containing the end capability, a function to check if the end capability was invoked, and a function to get the final result.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const makeEnd = <Result>() => {
  const result: { final?: Result; attachments?: Record<string, unknown> } = {};
  const end = capability(
    async ({
      final,
      attachments,
    }: {
      final: Result;
      attachments?: Record<string, unknown>;
    }): Promise<void> => {
      if (!Object.hasOwn(result, 'final')) {
        Object.assign(result, { final, ...ifDefined({ attachments }) });
      }
    },
    {
      description: 'Return a final response to the user.',
      args: {
        final: {
          required: true,
          type: 'string',
          description:
            'A concise final response that restates the requested information.',
        },
        attachments: {
          required: false,
          type: 'object',
          description: 'Attachments to the final response.',
        },
      },
    },
  );
  return [end, () => 'final' in result, () => result.final as Result] as const;
};

/**
 * A default `end` capability that does nothing.
 */
export const [end] = makeEnd();
