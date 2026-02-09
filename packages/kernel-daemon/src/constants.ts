import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Base directory for daemon state files.
 */
export const DAEMON_DIR = join(homedir(), '.ocap-kernel-daemon');

/**
 * Path to the daemon PID file.
 */
export const PID_FILE = join(DAEMON_DIR, 'daemon.pid');

/**
 * Path to the daemon Unix domain socket.
 */
export const SOCK_FILE = join(DAEMON_DIR, 'daemon.sock');

/**
 * Path to the persistent SQLite database.
 */
export const DB_FILE = join(DAEMON_DIR, 'store.db');

/**
 * Path to the daemon log file.
 */
export const LOG_FILE = join(DAEMON_DIR, 'daemon.log');
