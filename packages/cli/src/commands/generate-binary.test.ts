import type { Logger } from '@metamask/logger';
import { readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Script } from 'node:vm';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { generateBinarySource, handleCompile } from './generate-binary.ts';

describe('generate-binary', () => {
  describe('generateBinarySource', () => {
    const config = {
      ocapURL: 'ocap:abc123@localhost:8080',
      endpointURL: 'http://localhost:3000',
      name: 'my-console',
    };

    it('starts with a shebang line', () => {
      const source = generateBinarySource(config);
      expect(source.startsWith('#!/usr/bin/env node\n')).toBe(true);
    });

    it('embeds the OCAP URL', () => {
      const source = generateBinarySource(config);
      expect(source).toContain(JSON.stringify(config.ocapURL));
    });

    it('embeds the endpoint URL', () => {
      const source = generateBinarySource(config);
      expect(source).toContain(JSON.stringify(config.endpointURL));
    });

    it('embeds the binary name', () => {
      const source = generateBinarySource(config);
      expect(source).toContain(JSON.stringify(config.name));
    });

    it('produces valid JavaScript', () => {
      const source = generateBinarySource(config);
      // Strip the shebang line for syntax checking
      const jsSource = source.slice(source.indexOf('\n') + 1);
      // Script constructor compiles without executing; throws on syntax errors
      expect(() => new Script(jsSource)).not.toThrow();
    });

    it('uses https module for https endpoint', () => {
      const httpsConfig = {
        ...config,
        endpointURL: 'https://secure.example.com',
      };
      const source = generateBinarySource(httpsConfig);
      expect(source).toContain("require('node:https')");
      expect(source).toContain("require('node:http')");
    });

    it('handles special characters in OCAP URL', () => {
      const specialConfig = {
        ...config,
        ocapURL: 'ocap:abc+def/ghi=@host:8080,hint1,hint2',
      };
      const source = generateBinarySource(specialConfig);
      expect(source).toContain(JSON.stringify(specialConfig.ocapURL));
      // Verify it's still valid JS
      const jsSource = source.slice(source.indexOf('\n') + 1);
      expect(() => new Script(jsSource)).not.toThrow();
    });

    it('constructs invocation URL with method and args', () => {
      const source = generateBinarySource(config);
      expect(source).toContain("url.searchParams.set('method', command)");
      expect(source).toContain(
        "url.searchParams.set('args', JSON.stringify(args))",
      );
    });
  });

  describe('handleCompile', () => {
    let logger: Logger;
    let outputPath: string;

    beforeEach(() => {
      logger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      } as unknown as Logger;
      outputPath = join(
        tmpdir(),
        `test-binary-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
    });

    afterEach(async () => {
      try {
        await rm(outputPath);
      } catch {
        // File may not exist if test failed before writing
      }
    });

    it('writes binary to disk', async () => {
      await handleCompile({
        name: outputPath,
        ocapURL: 'ocap:abc@host',
        endpointURL: 'http://localhost:3000',
        logger,
      });

      const content = await readFile(outputPath, 'utf-8');
      expect(content).toContain('#!/usr/bin/env node');
      expect(content).toContain(JSON.stringify('ocap:abc@host'));
    });

    it('sets executable permissions', async () => {
      await handleCompile({
        name: outputPath,
        ocapURL: 'ocap:abc@host',
        endpointURL: 'http://localhost:3000',
        logger,
      });

      const fileStat = await stat(outputPath);
      // Check that owner execute bit is set (0o100)
      // eslint-disable-next-line no-bitwise
      expect(fileStat.mode & 0o111).toBeGreaterThan(0);
    });

    it('logs success message', async () => {
      await handleCompile({
        name: outputPath,
        ocapURL: 'ocap:abc@host',
        endpointURL: 'http://localhost:3000',
        logger,
      });

      expect(logger.info).toHaveBeenCalledWith(`Wrote binary: ${outputPath}`);
    });
  });
});
