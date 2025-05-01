import { describe, it, expect } from 'vitest';

import { getDBFolder } from './env.ts';

describe('getDBFolder', () => {
  it('should return configured folder from VITE_DB_FOLDER', () => {
    const testFolder = 'test-db-folder';
    import.meta.env.VITE_DB_FOLDER = testFolder;
    const result = getDBFolder();
    expect(result).toBe(testFolder);
  });

  it('should return empty string when no environment variables set', () => {
    delete import.meta.env.VITE_DB_FOLDER;
    const result = getDBFolder();
    expect(result).toBe('');
  });
});
