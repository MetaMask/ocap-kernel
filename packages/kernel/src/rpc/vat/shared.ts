import type { Struct } from '@metamask/superstruct';
import { tuple, array, string } from '@metamask/superstruct';
import type { VatCheckpoint } from '@ocap/store';

export const VatCheckpointStruct: Struct<VatCheckpoint> = tuple([
  array(tuple([string(), string()])),
  array(string()),
]);
