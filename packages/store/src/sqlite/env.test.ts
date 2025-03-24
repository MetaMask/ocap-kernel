import { describe, it, expect } from 'vitest';

import { getDBFolder } from './env.ts';

describe('getDBFolder', () => {
  it('should return random folder name for E2E tests', () => {
    import.meta.env.VITE_IS_E2E = true;
    delete import.meta.env.VITE_DB_FOLDER;
    const result = getDBFolder();
    expect(result.startsWith('e2e-')).toBe(true);
    expect(result.length).toBeGreaterThan(4);
    // verify randomness
    const secondResult = getDBFolder();
    expect(result).not.toBe(secondResult);
  });

  it('should return configured folder from VITE_DB_FOLDER', () => {
    const testFolder = 'test-db-folder';
    delete import.meta.env.VITE_IS_E2E;
    import.meta.env.VITE_DB_FOLDER = testFolder;
    const result = getDBFolder();
    expect(result).toBe(testFolder);
  });

  it('should return empty string when no environment variables set', () => {
    delete import.meta.env.VITE_IS_E2E;
    delete import.meta.env.VITE_DB_FOLDER;
    const result = getDBFolder();
    expect(result).toBe('');
  });

  it('should prioritize E2E over VITE_DB_FOLDER', () => {
    import.meta.env.VITE_IS_E2E = true;
    import.meta.env.VITE_DB_FOLDER = 'should-not-use-this';
    const result = getDBFolder();
    expect(result).not.toBe('should-not-use-this');
  });
});
