import '@testing-library/jest-dom/vitest';
import { setMaxListeners } from 'node:events';

import '@ocap/test-utils/mock-endoify';
import { setupDesignSystemMock } from './design-system-mock.tsx';

// Increase max listeners limit
setMaxListeners(20);

// Mock the design system since it's using react 16
// TODO: Remove this once DS upgrades to at least react 17
setupDesignSystemMock();
