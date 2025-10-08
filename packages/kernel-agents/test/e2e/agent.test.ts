import '@ocap/repo-tools/test-utils/mock-endoify';

import { Logger } from '@metamask/logger';
import { OllamaNodejsService } from '@ocap/kernel-language-model-service/ollama/nodejs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeAgent } from '../../src/agent.ts';
import {
  getWordLength,
  multiply,
  search,
} from '../../src/example-capabilities.ts';
import { DEFAULT_MODEL } from '../constants.ts';

/**
 * Generate a random letter.
 *
 * @returns a random letter.
 */
function randomLetter(): string {
  return String.fromCharCode(Math.floor(Math.random() * 26) + 97);
}

const logger = new Logger('test');

describe('agent', () => {
  let llmService: OllamaNodejsService;
  beforeEach(() => {
    llmService = new OllamaNodejsService({ endowments: { fetch } });
  });

  it(
    'should create an agent and process a request',
    {
      retry: 3,
      timeout: 5_000,
    },
    async () => {
      const llm = await llmService.makeInstance({ model: DEFAULT_MODEL });
      const agent = makeAgent({ llm, capabilities: {}, logger });
      expect(agent).toBeDefined();

      const letter = randomLetter().toUpperCase();
      const result = (await agent.task(
        `Name an animal that starts with the letter "${letter}"`,
      )) as string;
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      expect(result).toMatch(
        new RegExp(`(${letter}|${letter.toLowerCase()})+`, 'u'),
      );
    },
  );

  it(
    'should create an agent that uses tools',
    {
      retry: 3,
      timeout: 5_000,
    },
    async () => {
      const llm = await llmService.makeInstance({ model: DEFAULT_MODEL });
      const word = 'xf9147qsdhdkj';
      const getWordLengthSpy = vi.spyOn(getWordLength, 'func');
      // const getWordLength = vi.fn().mockResolvedValue(word.length.toString());
      const agent = makeAgent({ llm, capabilities: { getWordLength }, logger });
      expect(agent).toBeDefined();
      const result = await agent.task(
        `What is the length of the word "${word}"?`,
      );
      expect(result).toBeDefined();
      expect(getWordLengthSpy).toHaveBeenCalled();
      expect(result).includes(word.length.toString());
    },
  );

  it(
    'performs multi-step calculations',
    {
      retry: 3,
      timeout: 10_000,
    },
    async () => {
      const llm = await llmService.makeInstance({ model: DEFAULT_MODEL });
      const agent = makeAgent({
        llm,
        capabilities: {
          search,
          multiply,
          getWordLength,
        },
        logger,
      });
      expect(agent).toBeDefined();
      const [length, width, height] = [11, 47, 63];
      const result = await agent.task(
        `A box with length ${length}, width ${width}, and height ${height} have volume V. How many digits are in the numerical value of V?`,
      );
      expect(result).toBeDefined();
      expect(result).includes(`${length * width * height}`.length.toString());
    },
  );
});
