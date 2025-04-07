import type { VatId } from '@ocap/kernel';
import type { Logger } from '@ocap/utils';
import { makeLogger } from '@ocap/utils';

export const makeVatLogger = (vatId?: VatId): Logger =>
  makeLogger(`[vat-worker ${vatId ?? '(unknown)'}]`);
