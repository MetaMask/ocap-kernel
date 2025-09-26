import '@testing-library/jest-dom/vitest';
import { setMaxListeners } from 'node:events';

import '@ocap/repo-tools/test-utils/mock-endoify';

// Increase max listeners limit
setMaxListeners(20);
