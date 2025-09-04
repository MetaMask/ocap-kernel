import { array, exactOptional, object, string } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

export type FetchCapability = typeof fetch;

export type FetchCaveat = (
  ...args: Parameters<FetchCapability>
) => Promise<void>;

export const fetchConfigStruct = object({
  allowedHosts: exactOptional(array(string())),
});

export type FetchConfig = Infer<typeof fetchConfigStruct>;
