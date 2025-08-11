import { describe, it, expect } from 'vitest';

import type { InstanceConfig } from '../types.ts';
import { parseModelConfig } from './parse.ts';
import type { OllamaModelOptions } from './types.ts';

describe('parseModelConfig', () => {
  it('should return expected model', () => {
    const config = { model: 'llama2:7b' } as InstanceConfig<OllamaModelOptions>;
    const modelInfo = parseModelConfig(config);
    expect(modelInfo).toMatchObject({ model: 'llama2:7b' });
  });

  it('should return expected model with options', () => {
    const config = {
      model: 'llama2:7b',
      options: { temperature: 0.5 },
    } as InstanceConfig<OllamaModelOptions>;
    const modelInfo = parseModelConfig(config);
    expect(modelInfo).toMatchObject({
      model: 'llama2:7b',
      options: { temperature: 0.5 },
    });
  });

  it('should throw when no model is provided', () => {
    const config = {} as InstanceConfig<OllamaModelOptions>;
    expect(() => parseModelConfig(config)).toThrow('No model provided');
  });
});
