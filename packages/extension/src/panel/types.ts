import type { VatId } from '@ocap/kernel';

export type VatRecord = {
  id: VatId;
  name: string;
  source: string;
};
