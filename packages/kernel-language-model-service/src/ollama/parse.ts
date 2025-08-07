import type { InstanceConfig } from '../types.ts';
import type { OllamaModelOptions } from './types.ts';

export const parseModelConfig = (
  config: InstanceConfig<OllamaModelOptions>,
  archetypes: Record<string, string>,
): string => {
  if (config.archetype) {
    if (archetypes[config.archetype]) {
      return archetypes[config.archetype] as string;
    }
    throw new Error(`Archetype ${config.archetype} not found`);
  } else if (config.model) {
    return config.model;
  } else {
    throw new Error('No model or archetype provided');
  }
};
