import { capability } from './capability.ts';

export const end = capability(async ({ final }: { final: string }) => final, {
  description: 'Return a final response to the user.',
  args: {
    final: {
      type: 'string',
      description:
        'A concise final response that restates the requested information',
    },
  },
});
