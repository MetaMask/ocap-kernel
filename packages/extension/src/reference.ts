/**
 * Transcribed with care from @chipmorningstar's "Notes on the Design of an Ocap Kernel"
 */
import { isObject } from '@metamask/utils';

// ObjectReference to be specified in greater detail later
export type ObjectReference = string;

// For now, any string will match
export const isObjectReference = (value: unknown): value is ObjectReference =>
  typeof value === 'string' && value.match(/.*/u) !== null;

// 'slot' is a special key; let us not use it elsewhere.
export type SlotReference = { slot: number };

export const isSlotReference = (value: unknown): value is SlotReference =>
  isObject(value) && typeof value.slot === 'number';
