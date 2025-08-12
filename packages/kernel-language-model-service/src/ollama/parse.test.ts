import { describe, it, expect } from 'vitest';

import { parseModelConfig } from './parse.ts';
import type { OllamaInstanceConfig } from './types.ts';

describe('parseModelConfig', () => {
  it('should return expected model', () => {
    const config: OllamaInstanceConfig = { model: 'llama2:7b' };
    const modelInfo = parseModelConfig(config);
    expect(modelInfo).toMatchObject({ model: 'llama2:7b' });
  });

  it('should return expected model with options', () => {
    const config: OllamaInstanceConfig = {
      model: 'llama2:7b',
      options: { temperature: 0.5 },
    };
    const modelInfo = parseModelConfig(config);
    expect(modelInfo).toMatchObject({
      model: 'llama2:7b',
      options: { temperature: 0.5 },
    });
  });

  it('should throw when no model is provided', () => {
    // @ts-expect-error - destructive test
    const config: OllamaInstanceConfig = {};
    expect(() => parseModelConfig(config)).toThrow(/model/u);
  });
});
