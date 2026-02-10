import { execaNode } from 'execa';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const CLI_DIR = path.resolve(import.meta.dirname, '..', '..');
const APP = path.join(CLI_DIR, 'dist', 'app.mjs');
const REPO_ROOT = path.resolve(CLI_DIR, '..', '..');
const BUNDLE_PATH = path.resolve(
  REPO_ROOT,
  'packages/kernel-test/src/vats/discoverable-capability-vat.bundle',
);

async function ocap(...args: string[]) {
  return execaNode(APP, args, {
    cwd: CLI_DIR,
    timeout: 15_000,
    reject: false,
  });
}

describe('daemon e2e', () => {
  let bootstrapRootKref: string;
  let calculatorKref: string;

  beforeAll(async () => {
    // Ensure daemon is stopped and store is flushed for a clean slate
    await ocap('kernel', 'daemon', 'stop');
    await ocap('kernel', 'daemon', 'flush');
  });

  afterAll(async () => {
    // Best-effort cleanup: stop daemon and flush store
    await ocap('kernel', 'daemon', 'stop');
    await ocap('kernel', 'daemon', 'flush');
  });

  it('starts the daemon', async () => {
    const result = await ocap('kernel', 'daemon', 'start');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Daemon started');
  });

  it('reports daemon status', async () => {
    const result = await ocap('kernel', 'daemon', 'status');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Status: running');
  });

  it('reports already running on second start', async () => {
    const result = await ocap('kernel', 'daemon', 'start');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Daemon already running');
  });

  it('restarts the daemon', async () => {
    const result = await ocap('kernel', 'daemon', 'restart');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Daemon stopped');
    expect(result.stdout).toContain('Daemon started');
  });

  it('launches discoverable-capability-vat bundle', async () => {
    const result = await ocap('kernel', 'daemon', 'launch', BUNDLE_PATH);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Subcluster launched');
    expect(result.stdout).toContain('Bootstrap root kref:');

    const krefMatch = result.stdout.match(/Bootstrap root kref: (ko\d+)/u);
    expect(krefMatch).not.toBeNull();
    bootstrapRootKref = krefMatch![1]!;
  });

  it('invokes getCalculator on root', async () => {
    const result = await ocap(
      'kernel',
      'daemon',
      'invoke',
      bootstrapRootKref,
      'getCalculator',
    );
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout) as {
      body: string;
      slots: string[];
    };
    expect(parsed.slots).toBeDefined();
    expect(parsed.slots.length).toBeGreaterThan(0);
    calculatorKref = parsed.slots[0]!;
  });

  it('inspects the calculator object', async () => {
    const result = await ocap('kernel', 'daemon', 'inspect', calculatorKref);
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout) as {
      methodNames: string[];
    };
    expect(parsed.methodNames).toContain('add');
    expect(parsed.methodNames).toContain('multiply');
    expect(parsed.methodNames).toContain('greet');
  });

  it('invokes add on the calculator', async () => {
    const result = await ocap(
      'kernel',
      'daemon',
      'invoke',
      calculatorKref,
      'add',
      '2',
      '3',
    );
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout) as {
      body: string;
      slots: string[];
    };
    // Capdata body is smallcaps-encoded: "#5"
    expect(JSON.parse(parsed.body.slice(1))).toBe(5);
  });

  it('invokes multiply on the calculator', async () => {
    const result = await ocap(
      'kernel',
      'daemon',
      'invoke',
      calculatorKref,
      'multiply',
      '4',
      '5',
    );
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout) as {
      body: string;
      slots: string[];
    };
    expect(JSON.parse(parsed.body.slice(1))).toBe(20);
  });

  it('stops the daemon', async () => {
    const result = await ocap('kernel', 'daemon', 'stop');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Daemon stopped');
  });

  it('reports stopped status', async () => {
    const result = await ocap('kernel', 'daemon', 'status');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Status: stopped');
  });
});
