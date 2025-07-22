import type { InstanceConfig, ModelArchetype, ModelConfig } from './types.ts';

/**
 * Extract the model name from an instance config.
 *
 * @param config - The instance config to parse.
 * @param archetypes - The archetypes to use to map archetypes to model names.
 * @returns The model name as `{ model }`.
 */
export const parseInstanceConfig = (
  config: InstanceConfig,
  archetypes: Record<ModelArchetype, string>,
): ModelConfig => {
  if (config.model && config.archetype) {
    throw new Error('Cannot specify both model and archetype');
  }
  if (!config.model && !config.archetype) {
    throw new Error('Must specify either model or archetype');
  }
  if (config.model) {
    if (typeof config.model !== 'string') {
      throw new Error('Model must be a string');
    }
    return { model: config.model };
  }
  if (config.archetype) {
    if (typeof config.archetype !== 'string') {
      throw new Error('Archetype must be a string');
    }
    if (!archetypes[config.archetype]) {
      throw new Error(`Archetype ${config.archetype} is not supported`);
    }
    return { model: archetypes[config.archetype] };
  }
  throw new Error('Invalid instance config', { cause: config });
};
