import type { MethodRequest } from '@ocap/rpc-methods';

import { pingHandler, pingSpec } from '../vat/ping.ts';

export const kernelHandlers = {
  ping: pingHandler,
} as const;

export const kernelMethodSpecs = {
  ping: pingSpec,
} as const;

type Handlers = (typeof kernelHandlers)[keyof typeof kernelHandlers];

export type KernelMethod = Handlers['method'];

export type KernelMethodSpec = (typeof kernelMethodSpecs)['ping'];

export type KernelMethodRequest = MethodRequest<KernelMethodSpec>;
