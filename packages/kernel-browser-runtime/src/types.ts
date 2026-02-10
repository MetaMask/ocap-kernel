import type { Json } from '@metamask/utils';

/**
 * A CapTP message that can be sent over the wire.
 */
export type CapTPMessage = Record<string, Json>;
