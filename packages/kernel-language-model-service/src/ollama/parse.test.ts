import { describe, it, expect } from 'vitest';

import type { InstanceConfig } from '../types.ts';
import { parseModelConfig } from './parse.ts';
import type { OllamaModelOptions } from './types.ts';

describe('parseModelConfig', () => {
  const mockArchetypes = {
    default: 'llama2:7b',
    fast: 'llama2:3b',
    accurate: 'llama2:13b',
  };

  it.each([
    ['archetype', { archetype: 'fast' }, 'llama2:3b'],
    ['model', { model: 'custom-model:latest' }, 'custom-model:latest'],
    [
      'archetype and model (model takes precedence)',
      { archetype: 'accurate', model: 'custom-model:latest' },
      'custom-model:latest',
    ],
  ])('should return expected model when provided %s', (_, config, expected) => {
    // @ts-expect-error - destructive testing
    const modelInfo = parseModelConfig(config, mockArchetypes);
    expect(modelInfo).toMatchObject({ model: expected });
  });

  it('should handle empty archetypes object', () => {
    const archetype = 'nonexistent';
    const config: InstanceConfig<OllamaModelOptions> = { archetype };
    expect(() => parseModelConfig(config, {})).toThrow(
      `Archetype ${archetype} not found`,
    );
  });

  it('should throw when archetype not found in non-empty archetypes object', () => {
    const archetype = 'nonexistent';
    const config: InstanceConfig<OllamaModelOptions> = { archetype };
    expect(() => parseModelConfig(config, mockArchetypes)).toThrow(
      `Archetype ${archetype} not found`,
    );
  });

  it('should throw when neither archetype nor model is provided', () => {
    const config = {} as InstanceConfig<OllamaModelOptions>;
    expect(() => parseModelConfig(config, mockArchetypes)).toThrow(
      'No model or archetype provided',
    );
  });
});
