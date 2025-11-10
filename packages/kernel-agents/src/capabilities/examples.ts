import { capability } from './capability.ts';

type SearchResult = {
  source: string;
  published: string;
  snippet: string;
};
export const search = capability(
  async ({ query }: { query: string }): Promise<SearchResult[]> => [
    {
      source: 'https://www.google.com',
      published: '2025-01-01',
      snippet: `No information found for ${query}`,
    },
  ],
  {
    description: 'Search the web for information.',
    args: { query: { type: 'string', description: 'The query to search for' } },
    returns: {
      type: 'array',
      item: {
        type: 'object',
        properties: {
          source: {
            type: 'string',
            description: 'The source of the information.',
          },
          published: {
            type: 'string',
            description: 'The date the information was published.',
          },
          snippet: {
            type: 'string',
            description: 'The snippet of information.',
          },
        },
      },
    },
  },
);

const moonPhases = [
  'new moon',
  'waxing crescent',
  'first quarter',
  'waxing gibbous',
  'full moon',
  'waning gibbous',
  'third quarter',
  'waning crescent',
] as const;
type MoonPhase = (typeof moonPhases)[number];

export const getMoonPhase = capability(
  async (): Promise<MoonPhase> =>
    moonPhases[Math.floor(Math.random() * moonPhases.length)] as MoonPhase,
  {
    description: 'Get the current phase of the moon.',
    args: {},
    returns: {
      type: 'string',
      // TODO: Add enum support to the capability schema
      // @ts-expect-error - enum is not supported by the capability schema
      enum: moonPhases,
      description: 'The current phase of the moon.',
    },
  },
);

export const exampleCapabilities = { search, getMoonPhase };
