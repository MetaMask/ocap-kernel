import type { VatId } from '@metamask/ocap-kernel';

export type VatRecord = {
  id: VatId;
  source: string;
  parameters: string;
  creationOptions: string;
};
