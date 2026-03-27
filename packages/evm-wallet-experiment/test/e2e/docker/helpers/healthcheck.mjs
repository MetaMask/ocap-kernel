/* eslint-disable */
import { existsSync } from 'node:fs';

/**
 * Wait for a file to exist on disk.
 */
export async function waitForFile(filePath, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(filePath)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for file: ${filePath}`);
}

/**
 * Wait for an HTTP endpoint to respond with 2xx.
 */
export async function waitForHttp(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(url);
      if (resp.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timed out waiting for HTTP: ${url}`);
}

/**
 * Wait for all Docker services to be ready.
 */
export async function waitForAll() {
  await Promise.all([
    waitForHttp('http://evm:8545'),
    ...(process.env.LLM_API !== "openai" ? [waitForHttp((process.env.LLM_BASE_URL ?? "http://llm:11434") + "/api/tags")] : []),
    waitForFile('/run/ocap/home-info.json'),
    waitForFile('/run/ocap/away-info.json'),
  ]);
}
