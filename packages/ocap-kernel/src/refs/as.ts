import type { Struct } from '@metamask/superstruct';

import {
  ERefStruct,
  RRefStruct,
  VRefStruct,
  RefStruct,
  KRefStruct,
  KPIdStruct,
  KOIdStruct,
  EndpointIdStruct,
  RemoteIdStruct,
  VatIdStruct,
  XRefStruct,
  MRefStruct,
  ORefStruct,
  PRefStruct,
} from './structs.ts';

const makeAs =
  <Target extends { assert: (value: unknown) => unknown }>(struct: Target) =>
  (value: unknown) =>
    struct.assert(value) ??
    (value as Target extends Struct<infer Type> ? Type : never);

export const asVatId = makeAs(VatIdStruct);
export const asRemoteId = makeAs(RemoteIdStruct);
export const asEndpointId = makeAs(EndpointIdStruct);

export const asKOId = makeAs(KOIdStruct);
export const asKPId = makeAs(KPIdStruct);
export const asPRef = makeAs(PRefStruct);
export const asORef = makeAs(ORefStruct);

export const asXRef = makeAs(XRefStruct);
export const asMRef = makeAs(MRefStruct);

export const asKRef = makeAs(KRefStruct);
export const asVRef = makeAs(VRefStruct);
export const asRRef = makeAs(RRefStruct);
export const asERef = makeAs(ERefStruct);
export const asRef = makeAs(RefStruct);
