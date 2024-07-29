// eslint-disable-next-line spaced-comment
/// <reference types="ses"/>

import { vi } from 'vitest';

globalThis.lockdown = vi.fn(() => undefined);
globalThis.harden = vi.fn(<Value>(value: Value) => value);
