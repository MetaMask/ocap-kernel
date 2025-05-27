import type { VRef } from './types.ts';

export const EXTERNAL = 'x' as const;
export const EXPORT = '+' as const;
export const IMPORT = '-' as const;
export const KERNEL = 'k' as const;
export const OBJECT = 'o' as const;
export const PROMISE = 'p' as const;
export const REMOTE = 'r' as const;
export const VAT = 'v' as const;

export const ROOT_OBJECT_VREF: VRef = `${OBJECT}${EXPORT}0` as const;
