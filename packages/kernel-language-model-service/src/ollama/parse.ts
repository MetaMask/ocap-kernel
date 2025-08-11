import type { InstanceConfig, ModelInfo } from '../types.ts';
import type { OllamaModelOptions } from './types.ts';

export const parseModelConfig = (
  config: InstanceConfig<OllamaModelOptions>,
): ModelInfo<OllamaModelOptions> => {
  const { model, options } = config;
  if (!model) {
    throw new Error('No model provided');
  }
  return options ? { model, options } : { model };
};
