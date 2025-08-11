import type { InstanceConfig, ModelInfo } from '../types.ts';
import type { OllamaModelOptions } from './types.ts';

export const parseModelConfig = (
  config: InstanceConfig<OllamaModelOptions>,
  archetypes: Record<string, string>,
): ModelInfo<OllamaModelOptions> => {
  const { archetype, model } = config;
  if (model) {
    return { model };
  }
  if (archetype) {
    const resolvedModel = archetypes[archetype];
    if (!resolvedModel) {
      throw new Error(`Archetype ${archetype} not found`);
    }
    return { archetype, model: resolvedModel };
  }
  throw new Error('No model or archetype provided');
};
