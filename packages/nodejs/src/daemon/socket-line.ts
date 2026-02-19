import type { Socket } from 'node:net';

/**
 * Write a newline-delimited line to a socket.
 *
 * @param socket - The socket to write to.
 * @param line - The line to write (without trailing newline).
 */
export async function writeLine(socket: Socket, line: string): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.write(`${line}\n`, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Read a single newline-delimited line from a socket.
 *
 * @param socket - The socket to read from.
 * @param timeoutMs - Optional timeout in milliseconds. When provided, rejects
 * with a timeout error if no complete line is received within the limit.
 * @returns The line read (without trailing newline).
 */
export async function readLine(
  socket: Socket,
  timeoutMs?: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (timeoutMs !== undefined) {
      timer = setTimeout(() => {
        cleanup();
        reject(new Error('Socket read timed out'));
      }, timeoutMs);
    }

    /**
     * Remove all listeners and clear the timeout.
     */
    function cleanup(): void {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      socket.removeAllListeners('data');
      socket.removeAllListeners('error');
      socket.removeAllListeners('end');
      socket.removeAllListeners('close');
    }

    const onData = (data: Buffer): void => {
      buffer += data.toString();
      const idx = buffer.indexOf('\n');
      if (idx !== -1) {
        cleanup();
        resolve(buffer.slice(0, idx));
      }
    };

    socket.on('data', onData);
    socket.once('error', (error) => {
      cleanup();
      reject(error);
    });
    socket.once('end', () => {
      cleanup();
      reject(new Error('Socket closed before response received'));
    });
    socket.once('close', () => {
      cleanup();
      reject(new Error('Socket closed before response received'));
    });
  });
}
