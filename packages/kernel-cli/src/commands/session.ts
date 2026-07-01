import { ifDefined } from '@metamask/kernel-utils';
import type { JsonRpcFailure } from '@metamask/utils';
import { isJsonRpcFailure } from '@metamask/utils';
import type { Argv } from 'yargs';

import { getSocketPath, sendCommand } from './daemon-client.ts';
import { ensureDaemon } from './daemon-spawn.ts';

/**
 * Write a JSON-RPC error to stderr and set exit code 1.
 *
 * @param response - The failed JSON-RPC response.
 */
function writeRpcError(response: JsonRpcFailure): void {
  process.stderr.write(
    `Error: ${response.error.message} (code ${String(response.error.code)})\n`,
  );
  process.exitCode = 1;
}

/**
 * Create a new session and print its ID and OCAP URL.
 *
 * @param socketPath - The daemon socket path.
 * @param name - Optional session name. Defaults to alice, bob, carol, etc.
 */
async function handleSessionCreate(
  socketPath: string,
  name?: string,
): Promise<void> {
  const response = await sendCommand({
    socketPath,
    method: 'session.create',
    params: name === undefined ? {} : { name },
    timeoutMs: 10_000,
  });
  if (isJsonRpcFailure(response)) {
    writeRpcError(response);
    return;
  }
  const { sessionId, ocapUrl } = response.result as {
    sessionId: string;
    ocapUrl: string;
  };
  process.stdout.write(`sessionId: ${sessionId}\nocapUrl:   ${ocapUrl}\n`);
}

/**
 * List all sessions and print them in a compact table.
 *
 * @param socketPath - The daemon socket path.
 */
async function handleSessionList(socketPath: string): Promise<void> {
  const response = await sendCommand({
    socketPath,
    method: 'session.list',
    timeoutMs: 10_000,
  });
  if (isJsonRpcFailure(response)) {
    writeRpcError(response);
    return;
  }
  const sessions = response.result as {
    sessionId: string;
    ocapUrl: string;
  }[];
  if (sessions.length === 0) {
    process.stdout.write('No sessions.\n');
    return;
  }
  for (const { sessionId, ocapUrl } of sessions) {
    process.stdout.write(`${sessionId.padEnd(12)} ${ocapUrl}\n`);
  }
}

/**
 * Resolve a session ID to its OCAP URL via the daemon.
 *
 * @param socketPath - The daemon socket path.
 * @param sessionId - The session ID to look up.
 * @returns The OCAP URL, or undefined on error (exit code already set).
 */
export async function resolveSessionUrl(
  socketPath: string,
  sessionId: string,
): Promise<string | undefined> {
  const response = await sendCommand({
    socketPath,
    method: 'session.get',
    params: { sessionId },
    timeoutMs: 10_000,
  });
  if (isJsonRpcFailure(response)) {
    writeRpcError(response);
    return undefined;
  }
  return (response.result as { ocapUrl: string }).ocapUrl;
}

/**
 * List pending authorization requests for a session.
 *
 * @param socketPath - The daemon socket path.
 * @param sessionId - The session to query.
 */
async function handleSessionRequests(
  socketPath: string,
  sessionId: string,
): Promise<void> {
  const response = await sendCommand({
    socketPath,
    method: 'session.requests',
    params: { sessionId },
    timeoutMs: 10_000,
  });
  if (isJsonRpcFailure(response)) {
    writeRpcError(response);
    return;
  }
  const pending = response.result as {
    token: string;
    description: string;
  }[];
  if (pending.length === 0) {
    process.stdout.write('No pending requests.\n');
    return;
  }
  for (const { token, description } of pending) {
    process.stdout.write(`${token.padEnd(16)} ${description}\n`);
  }
}

/**
 * Queue a synthetic authorization request on a session for testing.
 *
 * @param socketPath - The daemon socket path.
 * @param sessionId - The session ID.
 * @param description - Human-readable description of the request.
 * @param reason - Optional reason for the request.
 */
async function handleSessionQueue(
  socketPath: string,
  sessionId: string,
  description: string,
  reason?: string,
): Promise<void> {
  const params: Record<string, unknown> = { sessionId, description };
  if (reason !== undefined) {
    params.reason = reason;
  }
  const response = await sendCommand({
    socketPath,
    method: 'session.queue',
    params,
    timeoutMs: 10_000,
  });
  if (isJsonRpcFailure(response)) {
    writeRpcError(response);
    return;
  }
  const { token } = response.result as { token: string };
  process.stdout.write(`Queued: ${token}\n`);
}

/**
 * Send an approve or reject decision for a pending request.
 *
 * @param socketPath - The daemon socket path.
 * @param sessionId - The session ID.
 * @param token - The request token.
 * @param verdict - 'accept' or 'reject'.
 * @param options - Optional guard body and feedback text.
 * @param options.guard - Serialized InterfaceGuard body (accept only, overrides default).
 * @param options.feedback - Human-readable note attached to the decision.
 */
async function handleSessionDecide(
  socketPath: string,
  sessionId: string,
  token: string,
  verdict: 'accept' | 'reject',
  { guard, feedback }: { guard?: string; feedback?: string } = {},
): Promise<void> {
  const params: Record<string, unknown> = {
    sessionId,
    token,
    verdict,
    feedback: feedback ?? '',
  };
  if (verdict === 'accept' && guard !== undefined) {
    params.guard = { body: guard, slots: [] };
  }

  const response = await sendCommand({
    socketPath,
    method: 'session.decide',
    params,
    timeoutMs: 10_000,
  });
  if (isJsonRpcFailure(response)) {
    writeRpcError(response);
    return;
  }
  process.stdout.write(
    `${verdict === 'accept' ? 'Approved' : 'Rejected'}: ${token}\n`,
  );
}

/**
 * Build the `session` yargs subcommand tree.
 *
 * @param yargs - The parent yargs instance to attach subcommands to.
 * @returns The augmented yargs instance.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildSessionCommands(yargs: Argv<any>): Argv<any> {
  const socketPath = getSocketPath();

  return yargs
    .command(
      'create',
      'Create a new authorization session',
      (_y) =>
        _y.option('name', {
          type: 'string',
          describe: 'Session name (default: alice, bob, carol, ...)',
        }),
      async (args) => {
        await ensureDaemon(socketPath);
        await handleSessionCreate(socketPath, args.name);
      },
    )
    .command(
      'list',
      'List all active sessions',
      (_y) => _y,
      async () => {
        await ensureDaemon(socketPath);
        await handleSessionList(socketPath);
      },
    )
    .command(
      'requests',
      'List pending authorization requests for a session',
      (_y) =>
        _y.option('session', {
          alias: 's',
          type: 'string',
          demandOption: true,
          describe: 'Session ID',
        }),
      async (args) => {
        await ensureDaemon(socketPath);
        await handleSessionRequests(socketPath, args.session);
      },
    )
    .command(
      'queue',
      'Queue a synthetic authorization request for testing',
      (_y) =>
        _y
          .option('session', {
            alias: 's',
            type: 'string',
            demandOption: true,
            describe: 'Session ID',
          })
          .option('description', {
            alias: 'd',
            type: 'string',
            demandOption: true,
            describe: 'Human-readable description of the request',
          })
          .option('reason', {
            alias: 'r',
            type: 'string',
            describe: 'Optional reason for the request',
          }),
      async (args) => {
        await ensureDaemon(socketPath);
        await handleSessionQueue(
          socketPath,
          args.session as string,
          args.description as string,
          args.reason,
        );
      },
    )
    .command(
      'approve <token>',
      'Approve a pending authorization request',
      (_y) =>
        _y
          .positional('token', {
            type: 'string',
            demandOption: true,
            describe: 'Request token',
          })
          .option('session', {
            alias: 's',
            type: 'string',
            demandOption: true,
            describe: 'Session ID',
          })
          .option('guard', {
            type: 'string',
            describe:
              'InterfaceGuard body override (absent = minimal approval)',
          })
          .option('feedback', {
            type: 'string',
            describe: 'Optional note attached to the decision',
          }),
      async (args) => {
        await ensureDaemon(socketPath);
        await handleSessionDecide(
          socketPath,
          args.session as string,
          String(args.token),
          'accept',
          ifDefined({
            guard: args.guard as string | undefined,
            feedback: args.feedback,
          }),
        );
      },
    )
    .command(
      'reject <token>',
      'Reject a pending authorization request',
      (_y) =>
        _y
          .positional('token', {
            type: 'string',
            demandOption: true,
            describe: 'Request token',
          })
          .option('session', {
            alias: 's',
            type: 'string',
            demandOption: true,
            describe: 'Session ID',
          })
          .option('feedback', {
            type: 'string',
            describe: 'Optional note attached to the rejection',
          }),
      async (args) => {
        await ensureDaemon(socketPath);
        await handleSessionDecide(
          socketPath,
          args.session as string,
          String(args.token),
          'reject',
          ifDefined({ feedback: args.feedback }),
        );
      },
    );
}
