// Minimal JSON-RPC probe for the LLM mediator vat.
//
// Connects to the mediator's Unix socket, sends `initialize` with an
// optional set of OCAP URLs, and (if URLs were supplied) issues a
// deliberately-invalid `send` to prove the error path also works.
// Prints every request/response pair to stdout.
//
// Usage:
//   node scripts/probe.mjs [SOCKET_PATH] [URL ...]
//
// Defaults SOCKET_PATH to ~/.ocap/llm-mediator.sock and the URL list to
// empty (which exercises just the bare `initialize` roundtrip).

import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const defaultSocket = path.join(
  process.env.OCAP_HOME ?? path.join(os.homedir(), '.ocap'),
  'llm-mediator.sock',
);

let socketPath = defaultSocket;
let urls = [];
if (args.length > 0) {
  if (args[0].startsWith('/') || args[0].startsWith('.')) {
    socketPath = args[0];
    urls = args.slice(1);
  } else {
    urls = args;
  }
}

/**
 * Connect a client socket, resolving once connected.
 *
 * @param {string} target - Filesystem path of the Unix socket.
 * @returns {Promise<net.Socket>} The connected socket.
 */
function connectSocket(target) {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(target);
    client.once('connect', () => resolve(client));
    client.once('error', reject);
  });
}

/**
 * Send one JSON-RPC request over `socket` and await the next line of
 * response. The mediator's protocol is strictly request/reply on a
 * single stream, so this simple wait-for-one-line loop is safe as long
 * as callers issue requests serially.
 *
 * @param {net.Socket} socket - The connected socket.
 * @param {object} request - The JSON-RPC request envelope.
 * @returns {Promise<object>} The parsed response envelope.
 */
function callOnce(socket, request) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    /**
     * Detach both listeners so we don't double-fire on the socket.
     */
    const detach = () => {
      // eslint-disable-next-line no-use-before-define
      socket.removeListener('data', onData);
      // eslint-disable-next-line no-use-before-define
      socket.removeListener('error', onError);
    };
    /**
     * Buffer incoming bytes and resolve on the first complete line.
     *
     * @param {Buffer} chunk - Incoming data.
     */
    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      const newline = buffer.indexOf('\n');
      if (newline < 0) {
        return;
      }
      const line = buffer.slice(0, newline);
      detach();
      try {
        resolve(JSON.parse(line));
      } catch {
        reject(new Error(`bad response line: ${line}`));
      }
    };
    /**
     * Propagate socket errors as promise rejection.
     *
     * @param {Error} cause - Socket error.
     */
    const onError = (cause) => {
      detach();
      reject(cause);
    };
    socket.on('data', onData);
    socket.once('error', onError);
    socket.write(`${JSON.stringify(request)}\n`);
  });
}

const socket = await connectSocket(socketPath);
process.stderr.write(`connected to ${socketPath}\n`);

const initRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { urls },
};
process.stdout.write(`→ ${JSON.stringify(initRequest)}\n`);
const initReply = await callOnce(socket, initRequest);
process.stdout.write(`← ${JSON.stringify(initReply)}\n`);

if (urls.length > 0) {
  const sendRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'send',
    params: {
      target: initReply?.result?.refs?.[0] ?? '@@o1',
      method: '__nonexistent_method__',
      args: [],
    },
  };
  process.stdout.write(`→ ${JSON.stringify(sendRequest)}\n`);
  const sendReply = await callOnce(socket, sendRequest);
  process.stdout.write(`← ${JSON.stringify(sendReply)}\n`);
}

socket.destroy();
