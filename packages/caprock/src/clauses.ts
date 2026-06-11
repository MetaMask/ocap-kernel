import type { ParsedInvocation } from '@metamask/kernel-utils/session/provision';
import { createHash } from 'node:crypto';

import { decompose } from './bash.ts';
import type { RpcClient } from './rpc.ts';
import type { Verdict } from './structs.ts';

/**
 * Parse a tool invocation into clause arrays suitable for per-clause sheaf
 * dispatch. For Bash, uses tree-sitter to decompose the command into
 * independent clauses (split on `&&`/`||`/`;`), each of which is a pipeline of
 * commands. For other tools, wraps the tool as a single one-invocation clause.
 *
 * Returns `null` when the command is dynamic or unparseable, i.e. when no
 * provision is possible.
 *
 * @param toolName - The Claude Code tool name (e.g. `'Bash'`, `'Read'`).
 * @param toolInput - The raw tool input object from the hook payload.
 * @returns Array of clauses (each clause is an array of ParsedInvocations), or `null`.
 */
export function buildClauses(
  toolName: string,
  toolInput: Record<string, unknown> | undefined,
): ParsedInvocation[][] | null {
  if (toolName === 'Bash') {
    const command =
      typeof toolInput?.command === 'string' ? toolInput.command : '';
    const result = decompose(command);
    if (!result.ok) {
      return null;
    }
    return result.clauses.map((clause) =>
      clause.map(({ name, argv }) => ({ name, argv })),
    );
  }
  const argv = Object.values(toolInput ?? {}).filter(
    (val): val is string => typeof val === 'string',
  );
  return [[{ name: toolName, argv }]];
}

/**
 * Route every clause through the permission vat. Returns `'allow'` only if
 * every clause is independently covered; returns `'ask'` as soon as one clause
 * is not covered. This is the cosheaf semantics: every component of a compound
 * command must be authorized for the command as a whole to be authorized.
 *
 * @param rpc - The RPC client for vat queries.
 * @param socketPath - The UNIX socket path of the daemon.
 * @param rootKref - The permission-vat root kref.
 * @param tool - The tool name being routed.
 * @param clauses - The clauses produced by {@link buildClauses}.
 * @returns `'allow'` when every clause is covered, otherwise `'ask'`.
 */
export async function routeAllClauses(
  rpc: RpcClient,
  socketPath: string,
  rootKref: string,
  tool: string,
  clauses: ParsedInvocation[][],
): Promise<Verdict> {
  for (const clause of clauses) {
    const verdict = await rpc.vatRoute(socketPath, rootKref, tool, clause);
    if (verdict !== 'allow') {
      return 'ask';
    }
  }
  return 'allow';
}

/**
 * Compute a short hash of the tool input, used as the per-call identifier in
 * the event log so multiple hook events for the same invocation can be
 * correlated.
 *
 * @param toolInput - The raw tool input object.
 * @returns A 16-character hex digest.
 */
export function inputSha(toolInput: Record<string, unknown>): string {
  return createHash('sha256')
    .update(JSON.stringify(toolInput))
    .digest('hex')
    .slice(0, 16);
}
