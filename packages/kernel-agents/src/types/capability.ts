import type { MethodSchema } from '@metamask/kernel-utils';

export type Capability<Args extends Record<string, unknown>, Return = null> = (
  args: Args,
) => Promise<Return>;

export type CapabilitySpec<
  Args extends Record<string, unknown> = Record<string, unknown>,
  Return = void,
> = {
  func: Capability<Args, Return>;
  schema: MethodSchema;
};

export type CapabilityRecord<Keys extends string = string> = Record<
  Keys,
  CapabilitySpec<never, unknown>
>;
