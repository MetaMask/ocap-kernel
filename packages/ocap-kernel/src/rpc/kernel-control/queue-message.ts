import type { CapData } from '@endo/marshal';
import { passStyleOf } from '@endo/marshal';
import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { tuple, string, array } from '@metamask/superstruct';
import { UnsafeJsonStruct } from '@metamask/utils';
import type { Json } from '@metamask/utils';

import type { Kernel } from '../../Kernel.ts';
import { kslot } from '../../liveslots/kernel-marshal.ts';
import type { KRef } from '../../types.ts';
import { insistKRef, KernelCapDataStruct, KRefStruct } from '../../types.ts';

/**
 * Enqueue a message to a vat via the kernel's crank queue.
 */
export const queueMessageSpec: MethodSpec<
  'queueMessage',
  [KRef, string, Json[]],
  CapData<KRef>
> = {
  method: 'queueMessage',
  params: tuple([KRefStruct, string(), array(UnsafeJsonStruct)]),
  result: KernelCapDataStruct,
};

export type QueueMessageHooks = {
  kernel: Pick<Kernel, 'queueMessage'>;
};

/**
 * Marker property key. In the JSON args arriving over this RPC, an
 * object whose only own property is `KREF_MARKER` and whose value is
 * a KRef string is expanded to a `kslot` standin so the kernel's
 * serializer (`kser`) encodes it as a real CapData slot in the
 * dispatched message.
 *
 * This lives at the RPC boundary specifically: external callers
 * (plugin code speaking JSON over the daemon socket) can't easily
 * synthesize a live remotable, so they name the target kref with a
 * marker instead. Internal callers of `Kernel.queueMessage` never
 * traffic in markers and are unaffected.
 */
const KREF_MARKER = '__ref__';

/**
 * Walk `value` and replace every kref-marker object
 * (`{ [KREF_MARKER]: "koN" }`) with a corresponding `kslot(kref)`
 * standin. Arrays are walked recursively; plain data records are
 * walked recursively only after they pass the `copyRecord` check via
 * `passStyleOf`. Remotables, promises, and other exotic passables
 * are left intact so their identity survives.
 *
 * The marker shape is checked BEFORE the `passStyleOf` gate because
 * markers arrive from the RPC boundary as raw JSON-parsed objects
 * (not hardened), which would otherwise trip `passStyleOf`.
 *
 * @param value - The value to walk.
 * @returns A value with markers expanded to kslot standins.
 */
function expandKrefMarkers(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => expandKrefMarkers(item));
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  const record = value as Record<string, unknown>;
  const ownKeys = Reflect.ownKeys(record);
  if (ownKeys.length === 1 && ownKeys[0] === KREF_MARKER) {
    const kref = record[KREF_MARKER];
    if (typeof kref === 'string') {
      insistKRef(kref);
      return kslot(kref);
    }
  }
  let style;
  try {
    style = passStyleOf(record);
  } catch {
    return record;
  }
  if (style !== 'copyRecord') {
    return record;
  }
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(record)) {
    out[key] = expandKrefMarkers(val);
  }
  return out;
}

export const queueMessageHandler: Handler<
  'queueMessage',
  [KRef, string, Json[]],
  Promise<CapData<KRef>>,
  QueueMessageHooks
> = {
  ...queueMessageSpec,
  hooks: { kernel: true },
  implementation: async (
    { kernel }: QueueMessageHooks,
    [target, method, args],
  ): Promise<CapData<KRef>> => {
    const expandedArgs = expandKrefMarkers(args) as unknown[];
    return kernel.queueMessage(target, method, expandedArgs);
  },
};
