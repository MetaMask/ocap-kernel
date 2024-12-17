import type { VatId } from '@ocap/kernel';

export type VatRecord = {
  id: VatId;
  source: string;
  parameters: string;
  creationOptions: string;
};
