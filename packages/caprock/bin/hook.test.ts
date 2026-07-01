/* eslint-disable n/no-process-env */
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

const HOOK_BIN = fileURLToPath(
  new URL('../dist/bin/hook.mjs', import.meta.url),
);
const PKG_DIR = fileURLToPath(new URL('..', import.meta.url));

/**
 * Spawn hook.mjs with a JSON payload on stdin and collect all output.
 *
 * @param payload - The hook event payload to send.
 * @param env - Extra environment variables.
 * @param timeoutMs - Kill timeout in milliseconds.
 * @returns stdout, stderr, and exit code.
 */
async function runHook(
  payload: unknown,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [HOOK_BIN], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Hook timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? -1 });
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

describe('hook binary', () => {
  let ocapHome: string;

  beforeAll(async () => {
    await execFileAsync('yarn', ['build'], { cwd: PKG_DIR });
    ocapHome = await mkdtemp(join(tmpdir(), 'caprock-hook-test-'));
  }, 60_000);

  afterAll(async () => {
    await rm(ocapHome, { recursive: true, force: true });
  });

  it('loads without SES globals (SessionStart)', async () => {
    const { stderr, exitCode } = await runHook(
      {
        hook_event_name: 'SessionStart',
        session_id: 'hook-integration-test',
        transcript_path: '/dev/null',
      },
      { OCAP_HOME: ocapHome },
      8_000,
    );

    expect(exitCode).toBe(0);
    expect(stderr).not.toMatch(/harden is not defined/u);
    expect(stderr).not.toMatch(/Cannot initialize @endo\/errors/u);
    expect(stderr).not.toMatch(/missing globalThis\.assert/u);
  }, 8_000);

  it('loads without SES globals (PreToolUse)', async () => {
    const { stdout, stderr, exitCode } = await runHook(
      {
        hook_event_name: 'PreToolUse',
        session_id: 'hook-integration-test',
        transcript_path: '/dev/null',
        tool_name: 'Bash',
        tool_input: { command: 'ls -la' },
      },
      { OCAP_HOME: ocapHome },
      8_000,
    );

    expect(exitCode).toBe(0);
    expect(stderr).not.toMatch(/harden is not defined/u);
    expect(stderr).not.toMatch(/Cannot initialize @endo\/errors/u);
    expect(stderr).not.toMatch(/missing globalThis\.assert/u);
    // With no daemon running the hook must not block — it passes through.
    expect(stdout).toContain('"continue":true');
  }, 8_000);
});
