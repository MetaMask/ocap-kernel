import type { VatCheckpoint } from '@metamask/kernel-store';
import type { Struct } from '@metamask/superstruct';
import { tuple, array, string, union, literal } from '@metamask/superstruct';

import type { VatDeliveryResult } from '../../types.ts';

export const VatCheckpointStruct: Struct<VatCheckpoint> = tuple([
  array(tuple([string(), string()])),
  array(string()),
]);

export const VatDeliveryResultStruct: Struct<VatDeliveryResult> = tuple([
  VatCheckpointStruct,
  union([string(), literal(null)]),
]);
