import '@testing-library/jest-dom/vitest';
import { setMaxListeners } from 'node:events';

// Increase max listeners limit
setMaxListeners(20);
