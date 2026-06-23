import '@metamask/kernel-shims/endoify';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  LLM_CONFIG_FILENAME,
  makeLlmKernelService,
  readLlmConfig,
  resolveLlmApiKey,
} from './llm-config.ts';

describe('llm-config', () => {
  let ocapDir: string;

  beforeEach(async () => {
    ocapDir = await mkdtemp(join(tmpdir(), 'llm-config-test-'));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(ocapDir, { recursive: true, force: true });
  });

  /**
   * Write an `llm.json` into the test OCAP home.
   *
   * @param contents - The raw file contents.
   */
  async function writeConfig(contents: string): Promise<void> {
    await writeFile(join(ocapDir, LLM_CONFIG_FILENAME), contents);
  }

  describe('readLlmConfig', () => {
    it('returns undefined when no config file exists', async () => {
      expect(await readLlmConfig(ocapDir)).toBeUndefined();
    });

    it('returns the parsed config', async () => {
      await writeConfig(
        JSON.stringify({
          provider: 'open-v1',
          baseUrl: 'http://127.0.0.1:18789',
          apiKeyEnv: 'TEST_LLM_TOKEN',
        }),
      );
      expect(await readLlmConfig(ocapDir)).toStrictEqual({
        provider: 'open-v1',
        baseUrl: 'http://127.0.0.1:18789',
        apiKeyEnv: 'TEST_LLM_TOKEN',
      });
    });

    it('throws on invalid JSON', async () => {
      await writeConfig('{not json');
      await expect(readLlmConfig(ocapDir)).rejects.toThrow(/Invalid JSON/u);
    });

    it.each([
      ['an unknown provider', { provider: 'closed-v9', baseUrl: 'x' }],
      ['a missing baseUrl', { provider: 'open-v1' }],
      [
        'an unknown key',
        { provider: 'open-v1', baseUrl: 'x', apiKey: 'inline-secret' },
      ],
    ])('throws on %s', async (_case, config) => {
      await writeConfig(JSON.stringify(config));
      await expect(readLlmConfig(ocapDir)).rejects.toThrow(
        /Invalid LLM config/u,
      );
    });
  });

  describe('resolveLlmApiKey', () => {
    it('reads the key from the named env var', async () => {
      vi.stubEnv('TEST_LLM_TOKEN', 'sekrit');
      expect(
        await resolveLlmApiKey({
          provider: 'open-v1',
          baseUrl: 'x',
          apiKeyEnv: 'TEST_LLM_TOKEN',
        }),
      ).toBe('sekrit');
    });

    it('throws when the named env var is unset', async () => {
      await expect(
        resolveLlmApiKey({
          provider: 'open-v1',
          baseUrl: 'x',
          apiKeyEnv: 'TEST_LLM_TOKEN_UNSET',
        }),
      ).rejects.toThrow(/unset or empty/u);
    });

    it('reads the key from the named file, trimmed', async () => {
      const keyPath = join(ocapDir, 'token.txt');
      await writeFile(keyPath, '  file-sekrit\n');
      expect(
        await resolveLlmApiKey({
          provider: 'open-v1',
          baseUrl: 'x',
          apiKeyFile: keyPath,
        }),
      ).toBe('file-sekrit');
    });

    it('throws when the named file is empty', async () => {
      const keyPath = join(ocapDir, 'token.txt');
      await writeFile(keyPath, '\n');
      await expect(
        resolveLlmApiKey({
          provider: 'open-v1',
          baseUrl: 'x',
          apiKeyFile: keyPath,
        }),
      ).rejects.toThrow(/is empty/u);
    });

    it('returns undefined when the config names no key source', async () => {
      expect(
        await resolveLlmApiKey({ provider: 'open-v1', baseUrl: 'x' }),
      ).toBeUndefined();
    });
  });

  describe('makeLlmKernelService', () => {
    it('builds a registrable languageModelService', async () => {
      vi.stubEnv('TEST_LLM_TOKEN', 'sekrit');
      const { name, service } = await makeLlmKernelService({
        provider: 'open-v1',
        baseUrl: 'http://127.0.0.1:18789',
        apiKeyEnv: 'TEST_LLM_TOKEN',
      });
      expect(name).toBe('languageModelService');
      expect(service).toHaveProperty('chat');
    });
  });
});
