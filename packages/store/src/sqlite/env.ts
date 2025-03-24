// eslint-disable-next-line spaced-comment
/// <reference types="vite/client" />

/**
 * Get the DB folder from environment variables.
 *
 * @returns The configured DB folder or an empty string
 */
export function getDBFolder(): string {
  if (import.meta.env.VITE_IS_E2E) {
    // generate a random folder name
    return `e2e-${Math.random().toString(36).substring(2, 15)}`;
  }

  return import.meta.env.VITE_DB_FOLDER ?? '';
}
