/* eslint-disable camelcase */
import { invocationToProvision } from '@metamask/kernel-utils/session/provision';
import type { Provision } from '@metamask/kernel-utils/session/provision';

import { buildClauses, inputSha, routeAllClauses } from '../clauses.ts';
import type { Decision, PreToolUsePayload } from '../types.ts';
import { getOrInitSession } from './init.ts';
import { preToolUseDeny } from './output.ts';
import type { HookDeps } from './types.ts';

/**
 * Handle the PreToolUse hook event.
 *
 * Decision flow:
 * 1. Build clauses for the tool call (returns `null` for dynamic Bash).
 * 2. Load (or initialize) the session state. Daemon down → continue.
 * 3. Ask the vat to route every clause. All-allow → continue (and fire a
 *    best-effort `recordProvisioned` so the TUI sees the provisioned call).
 * 4. Otherwise call `session.authorize` and block on the TUI verdict.
 *    Accept → register the granted provisions (or the exact clauses) as new
 *    sections and continue. Reject → deny.
 * 5. If the TUI is not connected, deny with a hint about how to connect.
 *
 * @param payload - The PreToolUse hook payload.
 * @param deps - Hook dependencies.
 */
export async function onPreToolUse(
  payload: PreToolUsePayload,
  deps: HookDeps,
): Promise<void> {
  const { session_id, tool_name, tool_input } = payload;
  const sha = inputSha(tool_input);
  const clauses = buildClauses(tool_name, tool_input);

  const state = await getOrInitSession(session_id, deps);
  if (!state) {
    deps.stdout(JSON.stringify({ continue: true }));
    return;
  }

  let vatResponse: 'allow' | 'ask' | 'unknown' = 'unknown';
  if (clauses !== null) {
    try {
      vatResponse = await routeAllClauses({
        rpc: deps.rpc,
        socketPath: deps.socketPath,
        rootKref: state.rootKref,
        tool: tool_name,
        clauses,
      });
    } catch (error) {
      deps.stderr(`[caprock] vatRoute failed: ${String(error)}\n`);
    }
  }

  await deps.store.appendEvent(session_id, {
    t: deps.now(),
    event: 'check',
    sessionId: session_id,
    toolName: tool_name,
    inputSha: sha,
    vatResponse,
  });

  if (vatResponse === 'allow') {
    if (clauses !== null) {
      recordAllowMatches({
        sessionId: session_id,
        toolName: tool_name,
        toolInput: tool_input,
        kernelSessionId: state.kernelSessionId,
        rootKref: state.rootKref,
        clauses,
        sha,
        deps,
      });
    }
    deps.stdout(JSON.stringify({ continue: true }));
    return;
  }

  if (state.kernelSessionId === undefined) {
    deps.stdout(JSON.stringify({ continue: true }));
    return;
  }

  const description = `Allow ${tool_name}(${JSON.stringify(tool_input)})`;
  let decision: Decision;
  try {
    decision = await deps.rpc.authorizeRequest(
      deps.socketPath,
      state.kernelSessionId,
      description,
      clauses === null ? undefined : { invocations: clauses.flat(), clauses },
    );
  } catch (error) {
    await handleAuthorizeError({
      error,
      sessionId: session_id,
      deps,
      currentKernelSessionId: state.kernelSessionId,
    });
    return;
  }

  if (decision.verdict === 'accept') {
    const decidedProvisions = decision.provisions;
    if (decidedProvisions !== undefined && decidedProvisions.length > 0) {
      for (const prov of decidedProvisions) {
        await deps.rpc
          .vatAddSection({
            socketPath: deps.socketPath,
            rootKref: state.rootKref,
            provision: prov,
          })
          .catch(() => undefined);
      }
    } else if (clauses !== null) {
      for (const clause of clauses) {
        await deps.rpc
          .vatAddSection({
            socketPath: deps.socketPath,
            rootKref: state.rootKref,
            provision: invocationToProvision(tool_name, clause),
          })
          .catch(() => undefined);
      }
    }
    await deps.store.appendEvent(session_id, {
      t: deps.now(),
      event: 'tui_accept',
      sessionId: session_id,
      toolName: tool_name,
      inputSha: sha,
      feedback: decision.feedback,
    });
    deps.stdout(JSON.stringify({ continue: true }));
    return;
  }

  await deps.store.appendEvent(session_id, {
    t: deps.now(),
    event: 'tui_reject',
    sessionId: session_id,
    toolName: tool_name,
    inputSha: sha,
    feedback: decision.feedback,
  });
  deps.stdout(`${preToolUseDeny(decision.feedback ?? 'Rejected via TUI')}\n`);
}

/**
 * Best-effort: query the vat for the provisions that matched each clause and
 * forward the result to `session.record` so the TUI history reflects the
 * provisioned auto-allow. Runs in the background; failures are silently
 * swallowed since the user-facing decision is already settled.
 *
 * @param args - The recording arguments.
 * @param args.sessionId - Claude Code session ID.
 * @param args.toolName - The tool name.
 * @param args.toolInput - The tool input, used to compose the description.
 * @param args.kernelSessionId - Kernel session ID, or undefined to skip.
 * @param args.rootKref - The permission-vat root kref.
 * @param args.clauses - Clauses being recorded.
 * @param args.sha - The input hash used in the event log.
 * @param args.deps - Hook dependencies.
 */
function recordAllowMatches(args: {
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  kernelSessionId: string | undefined;
  rootKref: string;
  clauses: ReturnType<typeof buildClauses>;
  sha: string;
  deps: HookDeps;
}): void {
  const {
    sessionId,
    toolName,
    toolInput,
    kernelSessionId,
    rootKref,
    clauses,
    sha,
    deps,
  } = args;
  if (kernelSessionId === undefined || clauses === null) {
    return;
  }
  const description = `Allow ${toolName}(${JSON.stringify(toolInput)})`;
  Promise.all(
    clauses.map(async (clause) =>
      deps.rpc.vatFindMatch({
        socketPath: deps.socketPath,
        rootKref,
        tool: toolName,
        invocations: clause,
      }),
    ),
  )
    .then(async (matches) => {
      const provisions = matches.filter(
        (matched): matched is Provision => matched !== null,
      );
      await deps.store.appendEvent(sessionId, {
        t: deps.now(),
        event: 'provision_match',
        sessionId,
        toolName,
        inputSha: sha,
        provisions,
      });
      await deps.rpc.recordProvisioned(
        deps.socketPath,
        kernelSessionId,
        description,
        {
          invocations: clauses.flat(),
          clauses,
          ...(provisions.length > 0 ? { provisions } : {}),
        },
      );
      return undefined;
    })
    .catch(() => undefined);
}

/**
 * Recover from an `authorizeRequest` failure. If the daemon reports the
 * session has been lost (e.g. it was restarted), try to create a fresh kernel
 * session and update the persisted state before producing the deny output.
 *
 * @param args - The error context.
 * @param args.error - The error from `authorizeRequest`.
 * @param args.sessionId - Claude Code session ID.
 * @param args.deps - Hook dependencies.
 * @param args.currentKernelSessionId - The kernel session ID at call time.
 */
async function handleAuthorizeError(args: {
  error: unknown;
  sessionId: string;
  deps: HookDeps;
  currentKernelSessionId: string;
}): Promise<void> {
  const { error, sessionId, deps, currentKernelSessionId } = args;
  const errorStr = String(error);
  const isNoSubscriber =
    (error as { code?: string }).code === 'NO_SUBSCRIBER' ||
    errorStr.includes('No subscriber');

  let connectId = currentKernelSessionId;
  if (!isNoSubscriber && errorStr.includes('Session not found')) {
    try {
      const state = await deps.store.loadSessionState(sessionId);
      if (state) {
        const kernel = await deps.rpc.createKernelSession(
          deps.socketPath,
          sessionId,
        );
        state.kernelSessionId = kernel.sessionId;
        state.ocapUrl = kernel.ocapUrl;
        await deps.store.saveSessionState(sessionId, state);
        connectId = kernel.sessionId;
      }
    } catch {
      /* recovery failed — fall through to deny */
    }
  }

  deps.stdout(
    `${preToolUseDeny(
      `[caprock] TUI not connected. Run \`ocap tui\` (session appears automatically) or \`ocap modal ${connectId}\` to connect directly, then retry.`,
    )}\n`,
  );
}
