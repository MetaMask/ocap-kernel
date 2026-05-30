import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join as joinPath } from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadConfig } from './config.ts';

const writeConfigFile = async (
  contents: Record<string, unknown>,
): Promise<string> => {
  const dir = await mkdtemp(joinPath(tmpdir(), 'demo-display-config-'));
  const path = joinPath(dir, 'config.json');
  await writeFile(path, JSON.stringify(contents), 'utf8');
  return path;
};

describe('loadConfig', () => {
  it('throws when matcherUrl is missing from env and file', async () => {
    await expect(loadConfig({ env: {} })).rejects.toThrow(
      /matcherUrl is required/u,
    );
  });

  it('reads matcherUrl from env', async () => {
    const config = await loadConfig({
      env: { MATCHER_OCAP_URL: 'ocap:zzz' },
    });
    expect(config.matcherUrl).toBe('ocap:zzz');
  });

  it('reads matcherUrl from config file when env is unset', async () => {
    const configPath = await writeConfigFile({ matcherUrl: 'ocap:from-file' });
    const config = await loadConfig({ env: {}, configPath });
    expect(config.matcherUrl).toBe('ocap:from-file');
  });

  it('env overrides config file', async () => {
    const configPath = await writeConfigFile({ matcherUrl: 'ocap:from-file' });
    const config = await loadConfig({
      env: { MATCHER_OCAP_URL: 'ocap:from-env' },
      configPath,
    });
    expect(config.matcherUrl).toBe('ocap:from-env');
  });

  it('coerces numeric env values', async () => {
    const config = await loadConfig({
      env: { MATCHER_OCAP_URL: 'ocap:zzz', DEMO_DISPLAY_PORT: '8181' },
    });
    expect(config.port).toBe(8181);
  });

  it('falls back to defaults when nothing is set', async () => {
    const config = await loadConfig({
      env: { MATCHER_OCAP_URL: 'ocap:zzz' },
    });
    expect({
      port: config.port,
      pollIntervalMs: config.pollIntervalMs,
      timeoutMs: config.timeoutMs,
      eventLogCapacity: config.eventLogCapacity,
    }).toStrictEqual({
      port: 7777,
      pollIntervalMs: 2_500,
      timeoutMs: 60_000,
      eventLogCapacity: 200,
    });
  });

  it('treats a non-existent config file as empty', async () => {
    const config = await loadConfig({
      env: { MATCHER_OCAP_URL: 'ocap:zzz' },
      configPath: '/tmp/does-not-exist-demo-display.json',
    });
    expect(config.matcherUrl).toBe('ocap:zzz');
  });
});
