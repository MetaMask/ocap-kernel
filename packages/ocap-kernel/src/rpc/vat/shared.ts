import type { VatCheckpoint } from '@metamask/kernel-store';
import type { Struct } from '@metamask/superstruct';
import { tuple, array, string } from '@metamask/superstruct';

export const VatCheckpointStruct: Struct<VatCheckpoint> = tuple([
  array(tuple([string(), string()])),
  array(string()),
]);
