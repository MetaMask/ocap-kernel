/* eslint-disable no-console */
/* eslint-disable n/no-process-env */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { decompose } from '../src/bash.ts';
import { getCaprockDir } from '../src/paths/ocap-kernel.ts';
import { getPluginManifestPath } from '../src/paths/plugin.ts';
import { readEvents, loadSessionState } from '../src/session.ts';
import { findTranscript, readTranscriptToolUses } from '../src/transcript.ts';
import type { CaprockEvent } from '../src/types.ts';

const BIN_DIR = import.meta.dirname;

/**
 * Read the plugin version from its manifest.
 *
 * @returns The version string, or 'unknown' if the manifest is unreadable.
 */
async function readVersion(): Promise<string> {
  try {
    const manifest = JSON.parse(
      await readFile(getPluginManifestPath(BIN_DIR), 'utf8'),
    ) as { version?: string };
    return manifest.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Count occurrences of each name and return pairs sorted descending by count.
 *
 * @param names - The list of names to count.
 * @returns Sorted `[count, name]` pairs, highest count first.
 */
function countByName(names: string[]): [number, string][] {
  const map = new Map<string, number>();
  for (const toolName of names) {
    map.set(toolName, (map.get(toolName) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => [count, name] as [number, string])
    .sort((a, b) => b[0] - a[0] || a[1].localeCompare(b[1]));
}

/**
 * Print a frequency table of tool or command names to stdout.
 *
 * @param names - The list of names to tally.
 */
function printToolCounts(names: string[]): void {
  for (const [count, name] of countByName(names)) {
    console.log(`  ${String(count).padStart(3)}  ${name}`);
  }
  console.log('  ──────────────────────');
  console.log(`  ${names.length} total`);
}

/**
 * Extract all bash subcommand names from the session transcript.
 *
 * @param sessionId - The Claude session ID.
 * @returns The list of parsed command names from all Bash tool uses.
 */
async function getBashSubcommands(sessionId: string): Promise<string[]> {
  const transcriptPath = await findTranscript(sessionId);
  if (!transcriptPath) {
    return [];
  }
  const toolUses = await readTranscriptToolUses(transcriptPath);
  const names: string[] = [];
  for (const use of toolUses) {
    if (use.name !== 'Bash') {
      continue;
    }
    const cmd = use.input?.command;
    if (typeof cmd !== 'string') {
      continue;
    }
    for (const parsed of decompose(cmd).clauses.flat()) {
      names.push(parsed.name);
    }
  }
  return names;
}

/**
 * Report authority stats using the caprock event trace.
 *
 * @param sessionId - The Claude session ID.
 * @param events - The caprock events for this session.
 */
async function reportFromCaprock(
  sessionId: string,
  events: CaprockEvent[],
): Promise<void> {
  console.log(`Trace: ${join(getCaprockDir(), `${sessionId}.jsonl`)}`);

  const state = await loadSessionState(sessionId);
  if (state?.kernelSessionId) {
    console.log(`TUI:   ocap modal ${state.kernelSessionId}`);
  } else {
    console.log(`TUI:   cat ~/.ocap/caprock/connect`);
  }

  console.log();

  const sessionStart = events.find((ev) => ev.event === 'session_start');
  const endowed = sessionStart
    ? `${sessionStart.settingsAllowCount as number} allowlist rules at session start`
    : 'not recorded';
  console.log(`Endowed authority: ${endowed}`);

  console.log();
  console.log('Invoked authority (tool uses):');
  printToolCounts(
    events
      .filter((ev) => ev.event === 'grant')
      .map((ev) => ev.toolName as string),
  );

  console.log();
  const prompted = events.filter((ev) => ev.event === 'prompted').length;
  const denied = events.filter((ev) => ev.event === 'denied').length;
  console.log(`Prompted (beyond allowlist): ${prompted}  |  Denied: ${denied}`);

  const ruleGrants = events.filter((ev) => ev.event === 'rule_grant');
  if (ruleGrants.length > 0) {
    console.log();
    console.log('Allowlist rules added this session:');
    for (const ev of ruleGrants) {
      console.log(`  ${ev.pattern as string}`);
    }
  }

  const bashCmds = await getBashSubcommands(sessionId);
  if (bashCmds.length > 0) {
    console.log();
    console.log('Bash commands invoked:');
    printToolCounts(bashCmds);
  }
}

/**
 * Report authority stats using only the Claude transcript (no caprock trace).
 *
 * @param sessionId - The Claude session ID.
 */
async function reportFromTranscript(sessionId: string): Promise<void> {
  const transcriptPath = await findTranscript(sessionId);
  if (!transcriptPath) {
    console.log(
      `No caprock trace or transcript found for session ${sessionId}.`,
    );
    return;
  }

  const toolUses = await readTranscriptToolUses(transcriptPath);
  console.log(`Transcript: ${transcriptPath}`);
  console.log('(caprock authority tracking was not active for this session)');
  console.log();

  console.log('Invoked authority (tool uses):');
  printToolCounts(toolUses.map((use) => use.name));

  const bashCmds: string[] = [];
  for (const use of toolUses) {
    if (use.name !== 'Bash') {
      continue;
    }
    const cmd = use.input?.command;
    if (typeof cmd !== 'string') {
      continue;
    }
    for (const parsed of decompose(cmd).clauses.flat()) {
      bashCmds.push(parsed.name);
    }
  }
  if (bashCmds.length > 0) {
    console.log();
    console.log('Bash commands invoked:');
    printToolCounts(bashCmds);
  }

  console.log();
  console.log('Endowed authority: not tracked this session');
  console.log('Prompted / Denied: not tracked this session');
}

/**
 * Display the session authority report.
 */
async function main(): Promise<void> {
  console.log(`caprock v${await readVersion()}`);
  console.log();

  const sessionId = process.argv[2] ?? process.env.CLAUDE_SESSION_ID;
  if (!sessionId) {
    console.log(
      'Session ID not provided — run this from within a Claude Code session.',
    );
    return;
  }

  const events = await readEvents(sessionId);
  const hasTracking = events.some(
    (ev) => ev.event === 'session_start' || ev.event === 'grant',
  );
  if (hasTracking) {
    await reportFromCaprock(sessionId, events);
  } else {
    await reportFromTranscript(sessionId);
  }
}

main().catch((error) => {
  process.stderr.write(`[caprock:status] ${String(error)}\n`);
  // eslint-disable-next-line n/no-process-exit
  process.exit(1);
});
