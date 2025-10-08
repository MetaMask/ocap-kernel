import { fetchMock } from '@ocap/repo-tools/test-utils/fetch-mock';
import { beforeEach, afterEach } from 'vitest';

// Global beforeEach for all E2E tests
beforeEach(() => {
  fetchMock.disableMocks();
});

// Global afterEach for all E2E tests
afterEach(() => {
  fetchMock.enableMocks();
});
