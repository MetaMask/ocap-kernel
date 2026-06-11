/* eslint-disable camelcase */
/* eslint-disable n/no-process-env */
/**
 * caprock — Claude Code CLI hook handler
 *
 * Invoked by Claude Code for each hook event. Reads JSON from stdin, dispatches
 * to the appropriate handler, writes control JSON to stdout if needed.
 */

import './harden-shim.ts';

import type {
  ParsedInvocation,
  Provision,
} from '@metamask/kernel-utils/session/provision';
import { invocationToProvision } from '@metamask/kernel-utils/session/provision';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, access, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { decompose } from '../src/bash.ts';
import {
  getCaprockDir,
  getSocketPath,
  getOcapBinPath,
} from '../src/paths/ocap-kernel.ts';
import {
  getPluginRoot,
  getVatBundlePath,
  getProjectSettingsLocalPath,
} from '../src/paths/plugin.ts';
import { getClaudeDir, getClaudeSettingsPath } from '../src/paths/user.ts';
import {
  pingDaemon,
  createKernelSession,
  authorizeRequest,
  recordProvisioned,
  launchPermissionVat,
  vatRoute,
  vatAddSection,
  vatFindMatch,
  vatSize,
} from '../src/rpc.ts';
import {
  loadSessionState,
  saveSessionState,
  appendEvent,
  readEvents,
  readSettingsAllowList,
  readSettingsDenyList,
  caprockOutputPath,
} from '../src/session.ts';
import type {
  AnyHookPayload,
  Decision,
  SessionState,
  SessionStartPayload,
  PreToolUsePayload,
  PostToolUsePayload,
  PermissionRequestPayload,
  PermissionDeniedPayload,
  FileChangedPayload,
  SessionEndPayload,
} from '../src/types.ts';

// ─── Constants ──────────────────────────────────────────────────────────────

const SOCKET_PATH = getSocketPath();
const BIN_DIR = import.meta.dirname;
const VAT_BUNDLE = getVatBundlePath(BIN_DIR);

// CLAUDE_PROJECT_DIR is exported by Claude Code to hook processes and points
// at the workspace root; fall back to the plugin root for standalone use.
const SETTINGS_PATHS = [
  getClaudeSettingsPath(),
  getProjectSettingsLocalPath(BIN_DIR),
];

// ─── Utilities ──────────────────────────────────────────────────────────────

/**
 * Returns the current time as an ISO 8601 string.
 *
 * @returns ISO 8601 timestamp.
 */
function now(): string {
  return new Date().toISOString();
}

/**
 * Compute a short hash of the tool input for use as a grant key.
 *
 * @param toolInput - The raw tool input object.
 * @returns A 16-character hex digest.
 */
function inputSha(toolInput: Record<string, unknown>): string {
  return createHash('sha256')
    .update(JSON.stringify(toolInput))
    .digest('hex')
    .slice(0, 16);
}

/**
 * Read all bytes from stdin and return them as a UTF-8 string.
 *
 * @returns The stdin content.
 */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// ─── Plugin self-registration ────────────────────────────────────────────────

/**
 * Add the allow rule for this plugin's status skill to `~/.claude/settings.json`.
 * Runs from the SessionStart hook so no permission check applies to the write.
 * Uses a glob over the version segment so the rule survives plugin updates.
 */
async function registerSkillPermissions(): Promise<void> {
  if (!process.env.CLAUDE_PLUGIN_ROOT) {
    return;
  }
  const pluginRoot = getPluginRoot(BIN_DIR);

  const settingsPath = getClaudeSettingsPath();
  let settings: { permissions?: { allow?: string[] } } = {};
  try {
    settings = JSON.parse(
      await readFile(settingsPath, 'utf8'),
    ) as typeof settings;
  } catch {
    /* file absent or unparseable — start fresh */
  }

  const current = settings.permissions?.allow ?? [];
  const versionGlob = pluginRoot.replace(/\/\d+\.\d+\.\d+$/u, '/*');
  const newEntries = [
    `Bash(${versionGlob}/scripts/status.sh *)`,
    `Bash(${versionGlob}/scripts/setup.sh)`,
    `Bash(${versionGlob}/scripts/audit.sh)`,
  ].filter((entry) => !current.includes(entry));

  if (newEntries.length === 0) {
    return;
  }

  settings.permissions ??= {};
  settings.permissions.allow = [...current, ...newEntries];
  await mkdir(getClaudeDir(), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
}

// ─── Daemon lifecycle ────────────────────────────────────────────────────────

/** Ensure the ocap-kernel daemon is running, starting it if not. */
async function ensureDaemon(): Promise<void> {
  if (await pingDaemon(SOCKET_PATH)) {
    return;
  }

  const ocapBin = getOcapBinPath(BIN_DIR);

  let resolvedBin = ocapBin;
  try {
    await access(ocapBin);
  } catch {
    resolvedBin = 'ocap'; // fall back to PATH
  }

  const isScript = resolvedBin.endsWith('.mjs') || resolvedBin.endsWith('.cjs');
  const cmd = isScript ? 'node' : resolvedBin;
  const cmdArgs = isScript
    ? [resolvedBin, 'daemon', 'start']
    : ['daemon', 'start'];

  const child = spawn(cmd, cmdArgs, {
    env: { ...process.env, OCAP_SOCKET_PATH: SOCKET_PATH },
    detached: true,
    stdio: 'ignore',
  });
  child.on('error', () => {
    process.stderr.write(
      '[caprock] `ocap` binary not found. Install @metamask/kernel-cli or set OCAP_BIN.\n',
    );
  });
  child.unref();
}

// ─── Clause decomposition ────────────────────────────────────────────────────

/**
 * Parse a tool invocation into clause arrays suitable for per-clause sheaf
 * dispatch. For Bash, uses tree-sitter to decompose the command into independent
 * clauses (split on &&/||/;), each of which is a pipeline of commands. For
 * other tools, wraps the tool as a single one-invocation clause.
 *
 * Returns null when the command is dynamic or unparseable (no provision possible).
 *
 * @param toolName - The Claude Code tool name.
 * @param toolInput - The raw tool input object.
 * @returns Array of clauses (each clause is an array of ParsedInvocations), or null.
 */
function buildClauses(
  toolName: string,
  toolInput: Record<string, unknown>,
): ParsedInvocation[][] | null {
  if (toolName === 'Bash') {
    const command =
      typeof toolInput.command === 'string' ? toolInput.command : '';
    const result = decompose(command);
    if (!result.ok) {
      return null;
    }
    return result.clauses.map((clause) =>
      clause.map(({ name, argv }) => ({ name, argv })),
    );
  }
  const argv = Object.values(toolInput).filter(
    (val): val is string => typeof val === 'string',
  );
  return [[{ name: toolName, argv }]];
}

// ─── Session initialization ──────────────────────────────────────────────────

/**
 * Load or create a session state. Handles the case where the hook fires before
 * SessionStart (e.g., if the plugin was installed mid-session).
 *
 * @param payload - The hook payload carrying session_id.
 * @param payload.session_id - The Claude Code session ID.
 * @param payload.transcript_path - Path to the session transcript.
 * @returns The session state, or null if the daemon is unavailable.
 */
async function getOrInitSession(payload: {
  session_id: string;
  transcript_path: string;
}): Promise<SessionState | null> {
  const { session_id } = payload;
  const existing = await loadSessionState(session_id);
  if (existing) {
    if (typeof existing.kernelSessionId !== 'string') {
      await ensureDaemon();
      if (!(await pingDaemon(SOCKET_PATH))) {
        return existing;
      }
      const ks = await createKernelSession(SOCKET_PATH, session_id);
      existing.kernelSessionId = ks.sessionId;
      existing.ocapUrl = ks.ocapUrl;
      await saveSessionState(session_id, existing);
    }
    return existing;
  }

  await ensureDaemon();
  if (!(await pingDaemon(SOCKET_PATH))) {
    return null;
  }

  const [
    snapshot,
    { rootKref, subclusterId },
    { sessionId: kernelSessionId, ocapUrl },
  ] = await Promise.all([
    collectSettingsSnapshot(),
    launchPermissionVat(SOCKET_PATH, VAT_BUNDLE),
    createKernelSession(SOCKET_PATH, session_id),
  ]);

  const state: SessionState = {
    sessionId: session_id,
    kernelSessionId,
    ocapUrl,
    rootKref,
    subclusterId,
    startedAt: now(),
    settingsSnapshot: snapshot.allow,
    settingsDenySnapshot: snapshot.deny,
  };
  await saveSessionState(session_id, state);
  return state;
}

/**
 * Collect the current union of all watched settings permission lists.
 *
 * @returns Deduplicated allow and deny entry lists.
 */
async function collectSettingsSnapshot(): Promise<{
  allow: string[];
  deny: string[];
}> {
  const [allowLists, denyLists] = await Promise.all([
    Promise.all(
      SETTINGS_PATHS.map(async (path) => readSettingsAllowList(path)),
    ),
    Promise.all(SETTINGS_PATHS.map(async (path) => readSettingsDenyList(path))),
  ]);
  return {
    allow: [...new Set(allowLists.flat())],
    deny: [...new Set(denyLists.flat())],
  };
}

// ─── Hook output helpers ──────────────────────────────────────────────────────

/**
 * Produce a PermissionRequest hook output that grants the request.
 *
 * @returns Serialized hook output JSON.
 */
function permissionAllow(): string {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior: 'allow' },
    },
  });
}

/**
 * Produce a PreToolUse hook output that denies the tool call.
 *
 * @param reason - Human-readable reason shown to Claude Code.
 * @returns Serialized hook output JSON.
 */
function preToolUseDeny(reason: string): string {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  });
}

// ─── Hook handlers ───────────────────────────────────────────────────────────

/**
 * Handle the SessionStart hook event: initialize daemon and permission vat.
 *
 * @param payload - The SessionStart hook payload.
 */
async function onSessionStart(payload: SessionStartPayload): Promise<void> {
  const { session_id, transcript_path } = payload;

  await registerSkillPermissions().catch((error) =>
    process.stderr.write(
      `[caprock] registerSkillPermissions: ${String(error)}\n`,
    ),
  );

  await ensureDaemon();
  if (!(await pingDaemon(SOCKET_PATH))) {
    process.stderr.write('[caprock] Daemon not available, skipping init\n');
    process.stdout.write(
      `${JSON.stringify({ output: '[caprock] daemon unavailable — authority tracking inactive' })}\n`,
    );
    return;
  }

  const [
    snapshot,
    { rootKref, subclusterId },
    { sessionId: kernelSessionId, ocapUrl },
  ] = await Promise.all([
    collectSettingsSnapshot(),
    launchPermissionVat(SOCKET_PATH, VAT_BUNDLE),
    createKernelSession(SOCKET_PATH, session_id),
  ]);

  const state: SessionState = {
    sessionId: session_id,
    kernelSessionId,
    ocapUrl,
    rootKref,
    subclusterId,
    startedAt: now(),
    settingsSnapshot: snapshot.allow,
    settingsDenySnapshot: snapshot.deny,
  };
  await saveSessionState(session_id, state);

  await appendEvent(session_id, {
    t: now(),
    event: 'session_start',
    sessionId: session_id,
    kernelSessionId,
    rootKref,
    transcriptPath: transcript_path,
    settingsAllowCount: snapshot.allow.length,
  });

  const connectCmd = `ocap modal ${kernelSessionId}`;
  await writeFile(join(getCaprockDir(), 'connect'), `${connectCmd}\n`);
  process.stderr.write(`[caprock] TUI: ${connectCmd}\n`);

  const caprockFile = join(getCaprockDir(), `${session_id}.jsonl`);
  process.stdout.write(
    `${JSON.stringify({
      output:
        `[caprock] tracking authority → ${caprockFile} (${snapshot.allow.length} rules in allowlist)\n` +
        `[caprock] TUI: run \`ocap tui\` (session appears automatically) or \`${connectCmd}\` to connect directly`,
    })}\n`,
  );
}

/**
 * Handle the PreToolUse hook event: check the vat and block for TUI decision.
 *
 * @param payload - The PreToolUse hook payload.
 */
async function onPreToolUse(payload: PreToolUsePayload): Promise<void> {
  const { session_id, tool_name, tool_input } = payload;
  const sha = inputSha(tool_input);
  const clauses = buildClauses(tool_name, tool_input);

  const state = await getOrInitSession(payload);
  if (!state) {
    process.stdout.write(JSON.stringify({ continue: true }));
    return;
  }

  let vatResponse: 'allow' | 'ask' | 'unknown' = 'unknown';
  try {
    if (clauses !== null) {
      let allAllow = true;
      for (const clause of clauses) {
        const verdict = await vatRoute(
          SOCKET_PATH,
          state.rootKref,
          tool_name,
          clause,
        );
        if (verdict !== 'allow') {
          allAllow = false;
          break;
        }
      }
      vatResponse = allAllow ? 'allow' : 'ask';
    }
  } catch (error) {
    process.stderr.write(`[caprock] vatRoute failed: ${String(error)}\n`);
  }

  await appendEvent(session_id, {
    t: now(),
    event: 'check',
    sessionId: session_id,
    toolName: tool_name,
    inputSha: sha,
    vatResponse,
  });

  if (vatResponse === 'allow') {
    if (state.kernelSessionId !== undefined && clauses !== null) {
      const autoDescription = `Allow ${tool_name}(${JSON.stringify(tool_input)})`;
      Promise.all(
        clauses.map(async (clause) =>
          vatFindMatch(SOCKET_PATH, state.rootKref, tool_name, clause),
        ),
      )
        .then(async (matches) => {
          const provisions = matches.filter(
            (matched): matched is Provision => matched !== null,
          );
          await appendEvent(session_id, {
            t: now(),
            event: 'provision_match',
            sessionId: session_id,
            toolName: tool_name,
            inputSha: sha,
            provisions,
          });
          await recordProvisioned(
            SOCKET_PATH,
            state.kernelSessionId,
            autoDescription,
            {
              // invocations is clauses.flat() — non-null because clauses !== null here
              invocations: clauses.flat(),
              clauses,
              ...(provisions.length > 0 ? { provisions } : {}),
            },
          );
          return undefined;
        })
        .catch(() => undefined);
    }
    process.stdout.write(JSON.stringify({ continue: true }));
    return;
  }

  if (state.kernelSessionId === undefined) {
    process.stdout.write(JSON.stringify({ continue: true }));
    return;
  }

  const description = `Allow ${tool_name}(${JSON.stringify(tool_input)})`;

  let decision: Decision;
  try {
    decision = await authorizeRequest(
      SOCKET_PATH,
      state.kernelSessionId,
      description,
      clauses === null
        ? undefined
        : {
            // invocations is clauses.flat() — non-null because clauses !== null here
            invocations: clauses.flat(),
            clauses,
          },
    );
  } catch (error) {
    const errorStr = String(error);
    const isNoSubscriber =
      (error as { code?: string }).code === 'NO_SUBSCRIBER' ||
      errorStr.includes('No subscriber');

    let connectId = state.kernelSessionId;
    if (!isNoSubscriber && errorStr.includes('Session not found')) {
      try {
        const ks = await createKernelSession(SOCKET_PATH, session_id);
        // eslint-disable-next-line require-atomic-updates
        state.kernelSessionId = ks.sessionId;
        // eslint-disable-next-line require-atomic-updates
        state.ocapUrl = ks.ocapUrl;
        await saveSessionState(session_id, state);
        connectId = ks.sessionId;
      } catch {
        /* recovery failed */
      }
    }

    process.stdout.write(
      `${preToolUseDeny(
        `[caprock] TUI not connected. Run \`ocap tui\` (session appears automatically) or \`ocap modal ${connectId}\` to connect directly, then retry.`,
      )}\n`,
    );
    return;
  }

  if (decision.verdict === 'accept') {
    const decidedProvisions = decision.provisions;
    if (decidedProvisions !== undefined && decidedProvisions.length > 0) {
      for (const prov of decidedProvisions) {
        await vatAddSection(SOCKET_PATH, state.rootKref, prov).catch(
          () => undefined,
        );
      }
    } else if (clauses !== null) {
      for (const clause of clauses) {
        await vatAddSection(
          SOCKET_PATH,
          state.rootKref,
          invocationToProvision(tool_name, clause),
        ).catch(() => undefined);
      }
    }
    await appendEvent(session_id, {
      t: now(),
      event: 'tui_accept',
      sessionId: session_id,
      toolName: tool_name,
      inputSha: sha,
      feedback: decision.feedback,
    });
    process.stdout.write(JSON.stringify({ continue: true }));
  } else {
    await appendEvent(session_id, {
      t: now(),
      event: 'tui_reject',
      sessionId: session_id,
      toolName: tool_name,
      inputSha: sha,
      feedback: decision.feedback,
    });
    process.stdout.write(
      `${preToolUseDeny(decision.feedback ?? 'Rejected via TUI')}\n`,
    );
  }
}

/**
 * Handle the PostToolUse hook event: grant the invocation in the permission vat.
 *
 * @param payload - The PostToolUse hook payload.
 */
async function onPostToolUse(payload: PostToolUsePayload): Promise<void> {
  const { session_id, tool_name, tool_input } = payload;
  const sha = inputSha(tool_input);

  const state = await loadSessionState(session_id);
  if (!state) {
    return;
  }

  const postClauses = buildClauses(tool_name, tool_input);
  if (postClauses !== null) {
    try {
      for (const clause of postClauses) {
        await vatAddSection(
          SOCKET_PATH,
          state.rootKref,
          invocationToProvision(tool_name, clause),
        );
      }
    } catch (error) {
      process.stderr.write(
        `[caprock] vatAddSection failed: ${String(error)}\n`,
      );
    }
  }

  await appendEvent(session_id, {
    t: now(),
    event: 'grant',
    sessionId: session_id,
    toolName: tool_name,
    inputSha: sha,
    grantType: 'invocation',
  });
}

/**
 * Handle the PermissionRequest hook event: fast-path via the vat if already granted.
 *
 * @param payload - The PermissionRequest hook payload.
 */
async function onPermissionRequest(
  payload: PermissionRequestPayload,
): Promise<void> {
  const { session_id, tool_name, tool_input } = payload;
  const sha = tool_input ? inputSha(tool_input) : null;

  await appendEvent(session_id, {
    t: now(),
    event: 'prompted',
    sessionId: session_id,
    toolName: tool_name ?? null,
    inputSha: sha,
  });

  const state = await loadSessionState(session_id);
  if (!state?.kernelSessionId) {
    return;
  }

  if (tool_name && tool_input) {
    const permClauses = buildClauses(tool_name, tool_input);
    if (permClauses !== null) {
      try {
        let allAllow = true;
        for (const clause of permClauses) {
          const verdict = await vatRoute(
            SOCKET_PATH,
            state.rootKref,
            tool_name,
            clause,
          );
          if (verdict !== 'allow') {
            allAllow = false;
            break;
          }
        }
        if (allAllow) {
          process.stdout.write(`${permissionAllow()}\n`);
        }
      } catch {
        /* vat error — defer to Claude Code native dialog */
      }
    }
  }
}

/**
 * Handle the PermissionDenied hook event: record the denial.
 *
 * @param payload - The PermissionDenied hook payload.
 */
async function onPermissionDenied(
  payload: PermissionDeniedPayload,
): Promise<void> {
  const { session_id, tool_name, tool_input } = payload;
  await appendEvent(session_id, {
    t: now(),
    event: 'denied',
    sessionId: session_id,
    toolName: tool_name ?? null,
    inputSha: tool_input ? inputSha(tool_input) : null,
  });
}

/**
 * Handle the FileChanged hook event: detect new allow-list entries and record them.
 *
 * @param payload - The FileChanged hook payload.
 */
async function onFileChanged(payload: FileChangedPayload): Promise<void> {
  const { session_id, file_path, change_type } = payload;
  if (change_type === 'delete') {
    return;
  }

  const state = await loadSessionState(session_id);
  if (!state) {
    return;
  }

  const current = await readSettingsAllowList(file_path);
  const prev = new Set(state.settingsSnapshot);
  const newEntries = current.filter((entry) => !prev.has(entry));

  for (const pattern of newEntries) {
    await appendEvent(session_id, {
      t: now(),
      event: 'rule_grant',
      sessionId: session_id,
      pattern,
      filePath: file_path,
    });
  }

  if (newEntries.length > 0) {
    state.settingsSnapshot = [
      ...new Set([...state.settingsSnapshot, ...current]),
    ];
    await saveSessionState(session_id, state);
  }
}

/**
 * Handle the SessionEnd hook event: finalize the event log and write a trace.
 *
 * @param payload - The SessionEnd hook payload.
 */
async function onSessionEnd(payload: SessionEndPayload): Promise<void> {
  const { session_id, transcript_path } = payload;

  const state = await loadSessionState(session_id);
  let allowCount = 0;
  if (state) {
    try {
      allowCount = await vatSize(SOCKET_PATH, state.rootKref);
    } catch {
      const events = await readEvents(session_id);
      allowCount = events.filter((event) => event.event === 'grant').length;
    }
  }

  await appendEvent(session_id, {
    t: now(),
    event: 'session_end',
    sessionId: session_id,
    allowCount,
  });

  const events = await readEvents(session_id);
  const outputPath = caprockOutputPath(transcript_path);
  await writeFile(
    outputPath,
    `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
  );
  process.stderr.write(`[caprock] Session trace → ${outputPath}\n`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

/** Read stdin, dispatch to the matching hook handler, and write the response. */
async function main(): Promise<void> {
  const raw = await readStdin();
  if (!raw.trim()) {
    return;
  }

  let payload: AnyHookPayload;
  try {
    payload = JSON.parse(raw) as AnyHookPayload;
  } catch {
    process.stderr.write(
      `[caprock] Invalid JSON on stdin: ${raw.slice(0, 80)}\n`,
    );
    return;
  }

  const event = payload.hook_event_name;

  try {
    switch (event) {
      case 'SessionStart':
        await onSessionStart(payload);
        break;
      case 'PreToolUse':
        await onPreToolUse(payload);
        break;
      case 'PostToolUse':
        await onPostToolUse(payload);
        break;
      case 'PermissionRequest':
        await onPermissionRequest(payload);
        break;
      case 'PermissionDenied':
        await onPermissionDenied(payload);
        break;
      case 'FileChanged':
        await onFileChanged(payload);
        break;
      case 'SessionEnd':
        await onSessionEnd(payload);
        break;
      default:
        break;
    }
  } catch (error) {
    process.stderr.write(`[caprock] Error in ${event}: ${String(error)}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`[caprock] Fatal: ${String(error)}\n`);
});
