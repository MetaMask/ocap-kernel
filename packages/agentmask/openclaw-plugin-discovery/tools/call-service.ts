/**
 * `service_call` tool: invoke a method on a service obtained via
 * `service_initiate_contact`.
 *
 * Artifact handle hand-off: when the result of a service call is
 * artifact-shaped (per `isArtifactShape`), the raw `data` blob (which
 * can run 10–20 KB for the SVG-producing services) never reaches the
 * LLM. Instead, the result is interned into the process-global
 * artifact store, allocated an opaque handle, and the LLM sees a
 * slim summary carrying just `{ handle, kind, fromService, summary }`.
 * The companion `@openclaw/demo` plugin's `demo_service_completed`
 * accepts the handle directly, so the bookkeeping flow never round-
 * trips the bytes through the model.
 *
 * Two argument-side placeholders are supported for referencing things
 * the agent previously received:
 *
 * - `{ __handle__: "artifact-N" }` — expanded to the stored artifact's
 *   `data` string. Lets the agent hand the PCB service the schematic
 *   from the previous phase, etc., without inlining the bytes into its
 *   tool call.
 *
 * - `{ __ref__: "nickname" }` — expanded to `{ __ref__: "koN" }` where
 *   `koN` is the kref for the ocap reference registered under
 *   `nickname` (from `service_initiate_contact` or the ref-walker that
 *   fires on service_call responses). The kernel side then re-encodes
 *   the kref marker as a real CapData slot so the receiver sees a live
 *   remotable, not a plain data object. This is the way to pass an
 *   ocap reference obtained from an earlier call as an argument to a
 *   later call.
 */
import { getArtifactStore, isArtifactShape } from '../artifact-store.ts';
import type { StoredArtifact } from '../artifact-store.ts';
import type { DaemonCaller } from '../daemon.ts';
import { isKref, resolveService, uniqueNickname } from '../state.ts';
import type { PluginState, ServiceEntry } from '../state.ts';
import type { OpenClawPluginApi, ToolResponse } from '../types.ts';

/**
 * Anchored slot-ref pattern the CLI's `prettifySmallcaps` emits for
 * remotable references: `<koN>` optionally followed by
 * ` (Alleged: <name>)`. Only whole-string matches are treated as
 * references — a slot-ref-looking substring inside a longer text
 * value (e.g. an SVG or Markdown body) is left alone.
 */
const SLOT_REF_PATTERN = /^<(ko\d+)>(?:\s+\(Alleged:\s*([^)]+)\))?$/u;

/**
 * Register the service_call tool.
 *
 * @param options - Registration options.
 * @param options.api - The OpenClaw plugin API.
 * @param options.daemon - The daemon caller.
 * @param options.state - The plugin state.
 */
export function registerCallServiceTool(options: {
  api: OpenClawPluginApi;
  daemon: DaemonCaller;
  state: PluginState;
}): void {
  const { api, daemon, state } = options;
  const artifacts = getArtifactStore();

  api.registerTool({
    name: 'service_call',
    label: 'Call service method',
    description:
      'Invoke a method on a service obtained via `service_initiate_contact`. ' +
      'Specify the service by nickname (e.g., "PersonalMessageSigner") or ' +
      'kref (e.g., "ko7"), the method name, and optionally a JSON array of ' +
      'arguments. Two placeholders may appear in args: ' +
      '`{"__handle__":"artifact-N"}` expands to the stored artifact `data` ' +
      'string, and `{"__ref__":"nickname"}` passes a previously-obtained ' +
      'ocap reference by nickname as a live capability arg. ' +
      'Artifact-shaped return values (`{kind, data, fromService, metadata?}` ' +
      'with `kind` in {svg, image, markdown, json, c-source}) are interned ' +
      'automatically and the reply carries only the new handle plus the ' +
      'summary fields the agent needs to narrate — never the raw data.',
    parameters: {
      type: 'object',
      properties: {
        service: {
          type: 'string',
          description:
            'Service nickname (e.g., "PersonalMessageSigner") or kref (e.g., "ko7").',
        },
        method: {
          type: 'string',
          description: 'Method name to invoke (e.g., "signMessage").',
        },
        args: {
          type: 'string',
          description:
            'JSON array of arguments (default: "[]"). To reference an ' +
            'artifact handle produced by an earlier call, use ' +
            '`{"__handle__":"artifact-3"}` in place of the artifact data. ' +
            'To pass an ocap reference obtained from an earlier call as ' +
            'a live capability arg, use `{"__ref__":"nickname"}` where ' +
            'nickname is the reference name shown in the earlier result.',
        },
      },
      required: ['service', 'method'],
    },
    async execute(
      _id: string,
      params: { service: string; method: string; args?: string },
    ): Promise<ToolResponse> {
      try {
        const kref = isKref(params.service)
          ? params.service
          : resolveService(params.service, state).kref;

        let parsedArgs: unknown[] = [];
        if (params.args) {
          const parsed = JSON.parse(params.args) as unknown;
          if (!Array.isArray(parsed)) {
            throw new Error('`args` must be a JSON array');
          }
          parsedArgs = parsed.map((arg) => expandArgPlaceholders(arg));
        }

        const result = await daemon.queueMessage({
          target: kref,
          method: params.method,
          args: parsedArgs,
        });

        const withRegisteredRefs = registerEmbeddedRefs(result);
        const summarised = summariseResult(withRegisteredRefs);

        const text =
          typeof summarised === 'string'
            ? summarised
            : JSON.stringify(summarised, null, 2);

        return {
          content: [{ type: 'text' as const, text }],
          details: undefined,
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error: ${message}` }],
          details: undefined,
        };
      }
    },
  });

  /**
   * Walk `value` and expand two placeholder shapes used to reference
   * things the producer LLM previously received:
   *
   * - `{ __handle__: "artifact-N" }` — replaced by the corresponding
   *   stored artifact's `data` string. Lets the agent pass a large
   *   artifact body as an arg without the bytes round-tripping through
   *   the model.
   *
   * - `{ __ref__: "nickname" }` — replaced by `{ __ref__: "koN" }`
   *   where `koN` is the kref for the ocap reference registered under
   *   that nickname. The kernel's arg-side machinery (see
   *   `expandKrefMarkers` in `@metamask/ocap-kernel`) sees the kref
   *   marker and re-encodes it as a real CapData slot before the
   *   message is delivered, so the receiver gets a live remotable, not
   *   a plain data object.
   *
   * Anything else passes through unchanged. Arrays and objects are
   * walked recursively. An unresolved handle or nickname throws so the
   * caller sees a clear error instead of silently shipping a
   * placeholder to the service.
   *
   * @param value - The argument value to expand.
   * @returns The value with all placeholders substituted.
   */
  function expandArgPlaceholders(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((entry) => expandArgPlaceholders(entry));
    }
    if (typeof value !== 'object' || value === null) {
      return value;
    }
    const record = value as Record<string, unknown>;
    const ownKeys = Reflect.ownKeys(record);
    if (ownKeys.length === 1) {
      const [only] = ownKeys;
      if (only === '__handle__') {
        const handle = record.__handle__;
        if (typeof handle === 'string') {
          const stored = artifacts.get(handle);
          if (stored === undefined) {
            throw new Error(`unknown artifact handle: ${handle}`);
          }
          return stored.data;
        }
      } else if (only === '__ref__') {
        const nickname = record.__ref__;
        if (typeof nickname === 'string') {
          const entry = state.services.get(nickname);
          if (entry === undefined) {
            throw new Error(
              `unknown reference nickname: ${nickname}. ` +
                'The `__ref__` marker names an ocap reference registered ' +
                'from a previous service_call response.',
            );
          }
          return { __ref__: entry.kref };
        }
      }
    }
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(record)) {
      out[key] = expandArgPlaceholders(val);
    }
    return out;
  }

  /**
   * Walk `value` looking for prettified slot-reference strings (`<koN>`
   * or `<koN> (Alleged: ...)`) — the shape `prettifySmallcaps` emits
   * on the CLI side for remotable references embedded in a response.
   * Every such reference is registered as a service under a nickname
   * derived from its alleged name, and the string is replaced with
   * that nickname so the LLM sees a callable service handle instead
   * of a raw kref presentation.
   *
   * Only whole-string matches are rewritten — slot-ref-looking
   * substrings inside long text values (SVG bodies, markdown, etc.)
   * pass through unchanged.
   *
   * @param value - The value to walk.
   * @returns The value with slot-ref strings replaced by service
   *   nicknames.
   */
  function registerEmbeddedRefs(value: unknown): unknown {
    if (typeof value === 'string') {
      const match = SLOT_REF_PATTERN.exec(value);
      if (!match) {
        return value;
      }
      const [, refKref, alleged] = match;
      if (refKref === undefined) {
        return value;
      }
      // Reuse an existing registration for the same kref if we've
      // seen it before — a service returned twice should share one
      // nickname.
      for (const [nickname, entry] of state.services.entries()) {
        if (entry.kref === refKref) {
          return nickname;
        }
      }
      const baseNickname =
        typeof alleged === 'string' && alleged.length > 0
          ? alleged
          : `service:${refKref}`;
      const nickname = uniqueNickname(
        baseNickname,
        new Set(state.services.keys()),
      );
      const entry: ServiceEntry = {
        kref: refKref,
        nickname,
        fromContact: 'service_call:embedded-ref',
      };
      state.services.set(nickname, entry);
      return nickname;
    }
    if (Array.isArray(value)) {
      return value.map((item) => registerEmbeddedRefs(item));
    }
    if (typeof value === 'object' && value !== null) {
      const record = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(record)) {
        out[key] = registerEmbeddedRefs(val);
      }
      return out;
    }
    return value;
  }

  /**
   * If `result` is artifact-shaped, intern it and return a slim
   * summary the LLM can read cheaply. Otherwise return the result
   * unchanged. Handles results wrapped in a single-property object
   * (e.g. `{ accepted: true, firmware: { kind, data, ... } }` from
   * firmware.implement): the wrapper is preserved and the artifact-
   * shaped child is interned in place.
   *
   * @param result - The raw daemon reply.
   * @returns The result with artifact bodies replaced by handles.
   */
  function summariseResult(result: unknown): unknown {
    if (isArtifactShape(result)) {
      return slimForAgent(artifacts.intern(result));
    }
    if (typeof result === 'object' && result !== null) {
      const record = result as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(record)) {
        out[key] = isArtifactShape(val)
          ? slimForAgent(artifacts.intern(val))
          : val;
      }
      return out;
    }
    return result;
  }
}

/**
 * Construct the slim summary the LLM sees in place of an interned
 * artifact. Carries the handle (so the agent can hand it back to
 * `demo_service_completed` or forward it as a `{__handle__:...}`
 * arg), the kind, the originating service tag, the service-author-
 * written summary blurb, and any `receiveShipmentUrl` the service
 * issued (an ocap URL the agent threads through to supplier commit
 * methods so they can ship inputs directly to the issuer). The full
 * `data` is never surfaced.
 *
 * @param stored - The newly interned artifact.
 * @returns The slim view the agent receives.
 */
function slimForAgent(stored: StoredArtifact): Record<string, unknown> {
  return {
    handle: stored.handle,
    kind: stored.kind,
    fromService: stored.fromService,
    title: stored.metadata?.title,
    summary: stored.metadata?.summary,
    ...(stored.receiveShipment === undefined
      ? {}
      : { receiveShipment: stored.receiveShipment }),
    ...(stored.reviser === undefined ? {} : { reviser: stored.reviser }),
  };
}
