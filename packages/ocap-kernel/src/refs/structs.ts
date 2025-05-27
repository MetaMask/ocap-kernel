import { define } from '@metamask/superstruct';

import type {
  EndpointId,
  ERef,
  KOId,
  KPId,
  KRef,
  RRef,
  Ref,
  RemoteId,
  VRef,
  VatId,
  XRef,
  MRef,
  ORef,
  PRef,
} from './types.ts';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const definedPrefixedString = <Type>(name: string, prefix: string[]) => {
  /**
   * Validate a string value against a list of prefixes.
   *
   * @param value - The value to validate.
   * @returns True if the value is a string and starts with one of the prefixes, false otherwise.
   */
  function validator(value: unknown): value is Type {
    return (
      typeof value === 'string' && prefix.some((pre) => value.startsWith(pre))
    );
  }
  return define<Type>(name, validator);
};

export const VatIdStruct = definedPrefixedString<VatId>('VatId', ['v']);
export const RemoteIdStruct = definedPrefixedString<RemoteId>('RemoteId', [
  'r',
]);
export const EndpointIdStruct = definedPrefixedString<EndpointId>(
  'EndpointId',
  ['v', 'r'],
);

export const KOIdStruct = definedPrefixedString<KOId>('KOId', ['ko']);
export const KPIdStruct = definedPrefixedString<KPId>('KPId', ['kp']);
export const PRefStruct = definedPrefixedString<PRef>('PRef', [
  'kp',
  'p',
  'rp',
]);
export const ORefStruct = definedPrefixedString<ORef>('ORef', [
  'ko',
  'o',
  'ro',
]);

export const XRefStruct = definedPrefixedString<XRef>('XRef', ['o+']);
export const MRefStruct = definedPrefixedString<MRef>('MRef', ['o-']);

export const VRefStruct = definedPrefixedString<VRef>('VRef', ['o', 'p']);
export const RRefStruct = definedPrefixedString<RRef>('RRef', ['ro', 'rp']);
export const ERefStruct = definedPrefixedString<ERef>('ERef', [
  'o',
  'p',
  'ro',
  'rp',
]);
export const KRefStruct = definedPrefixedString<KRef>('KRef', ['ko', 'kp']);
export const RefStruct = definedPrefixedString<Ref>('Ref', [
  'ko',
  'kp',
  'o',
  'p',
  'ro',
  'rp',
]);
