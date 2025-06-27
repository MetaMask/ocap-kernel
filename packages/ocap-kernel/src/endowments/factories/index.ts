import * as makeOcapUrl from './make-ocap-url.ts';
import * as makeRevoker from './make-revoker.ts';
import * as scry from './scry.ts';
import type { EndowmentDefinition } from '../types.ts';

const endowmentDefinitions = {
  makeOcapUrl,
  makeRevoker,
  scry,
} as const satisfies Record<string, EndowmentDefinition>;

export type EndowmentName = keyof typeof endowmentDefinitions;

export type Endowments = {
  [K in EndowmentName]: ReturnType<(typeof endowmentDefinitions)[K]['factory']>;
};

export default endowmentDefinitions;
