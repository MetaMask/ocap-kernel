import { makeLoadExtension } from '@ocap/repo-tools/test-utils/extension';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export { sessionPath } from '@ocap/repo-tools/test-utils/extension';

const extensionPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../dist',
);

export const loadExtension = async (contextId?: string) => {
  return makeLoadExtension({
    contextId,
    extensionPath,
  });
};
