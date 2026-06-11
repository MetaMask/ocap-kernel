import type {
  ArgPattern,
  InvocationPattern,
  Provision,
} from '@metamask/kernel-utils/session/provision';
import type { Struct } from '@metamask/superstruct';
import {
  array,
  enums,
  literal,
  nullable,
  object,
  optional,
  string,
  union,
} from '@metamask/superstruct';

import type { Decision } from './types.ts';

/**
 * Local copy of `@metamask/kernel-utils`'s `CapDataStruct`. Duplicated here
 * because importing it from the kernel-utils barrel pulls in `@endo/*` modules
 * that require SES lockdown — and the hook process must remain lockdown-free
 * to keep tree-sitter's native bindings working.
 */
export const CapDataStruct = object({
  body: string(),
  slots: array(string()),
});

/**
 * The two outcomes the permission vat can return for a routing query.
 * `'allow'` means at least one section in the sheaf covers the invocation;
 * `'ask'` means no section matched and a TUI decision is required.
 */
export type Verdict = 'allow' | 'ask';

export const VerdictStruct = enums(['allow', 'ask']) as Struct<Verdict>;

export const ArgPatternStruct = union([
  object({ kind: literal('exact'), value: string() }),
  object({ kind: literal('prefix'), prefix: string() }),
  object({ kind: literal('wildcard') }),
]) as Struct<ArgPattern>;

export const InvocationPatternStruct = object({
  name: string(),
  argPatterns: array(ArgPatternStruct),
}) as Struct<InvocationPattern>;

export const ProvisionStruct = object({
  tool: string(),
  patterns: array(InvocationPatternStruct),
}) as Struct<Provision>;

export const NullableProvisionStruct = nullable(ProvisionStruct);

export const ProvisionsArrayStruct = array(ProvisionStruct);

export const DecisionStruct = object({
  token: string(),
  verdict: enums(['accept', 'reject']),
  feedback: string(),
  guard: optional(CapDataStruct),
  provisions: optional(array(ProvisionStruct)),
}) as Struct<Decision>;

export const KernelSessionStruct = object({
  sessionId: string(),
  ocapUrl: string(),
  cwd: optional(string()),
  startedAt: optional(string()),
});

export const LaunchSubclusterStruct = object({
  rootKref: string(),
  subclusterId: string(),
  bootstrapResult: optional(nullable(CapDataStruct)),
});
