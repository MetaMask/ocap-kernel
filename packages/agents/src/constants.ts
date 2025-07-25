/**
 * The default archetypes to use when no archetype is provided. LLM service
 * providers are not required to provide every model recorded here. The cost of
 * this freedom is they should declare their own default archetype values.
 */
export const defaultArchetypes = {
  general: 'llama3.2:latest',
  fast: 'llama3.2:latest',
  thinker: 'deepseek-r1:3b',
  'code:writer': 'llama3.2:latest',
  'code:reader': 'llama3.2:latest',
} as const;
