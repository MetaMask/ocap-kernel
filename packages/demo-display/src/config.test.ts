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
  it('falls back to defaults when nothing is set', async () => {
    const config = await loadConfig({ env: {} });
    expect(config).toStrictEqual({
      port: 7777,
      eventLogCapacity: 200,
      ttydUrl: undefined,
    });
  });

  it('reads ttydUrl from env', async () => {
    const config = await loadConfig({
      env: { DEMO_DISPLAY_TTYD_URL: 'http://example:7681' },
    });
    expect(config.ttydUrl).toBe('http://example:7681');
  });

  it('reads ttydUrl from config file when env is unset', async () => {
    const configPath = await writeConfigFile({
      ttydUrl: 'http://from-file:7681',
    });
    const config = await loadConfig({ env: {}, configPath });
    expect(config.ttydUrl).toBe('http://from-file:7681');
  });

  it('env overrides config file for ttydUrl', async () => {
    const configPath = await writeConfigFile({
      ttydUrl: 'http://from-file:7681',
    });
    const config = await loadConfig({
      env: { DEMO_DISPLAY_TTYD_URL: 'http://from-env:7681' },
      configPath,
    });
    expect(config.ttydUrl).toBe('http://from-env:7681');
  });

  it('coerces numeric env values', async () => {
    const config = await loadConfig({
      env: { DEMO_DISPLAY_PORT: '8181' },
    });
    expect(config.port).toBe(8181);
  });

  it('treats a non-existent config file as empty', async () => {
    const config = await loadConfig({
      env: {},
      configPath: '/tmp/does-not-exist-demo-display.json',
    });
    expect(config.port).toBe(7777);
  });
});
