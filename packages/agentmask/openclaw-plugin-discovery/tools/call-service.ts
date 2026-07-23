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
 * The same conversion runs in reverse on the argument side: any
 * `{ __handle__: "artifact-N" }` value found anywhere in the parsed
 * `args` array is expanded to the stored artifact's `data` string
 * before the args are forwarded to the daemon. This lets the agent
 * keep passing handles around between phases — e.g. handing the PCB
 * service the schematic produced by the previous phase — without
 * inlining the bytes into its tool calls.
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
      'arguments. To pass an artifact produced by an earlier service call as ' +
      'an argument, wrap its handle in `{"__handle__":"artifact-N"}`; the ' +
      'wrapper is expanded to the stored content before the call is made. ' +
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
            '`{"__handle__":"artifact-3"}` in place of the artifact data.',
        },
      },
      required: ['service', 'method'],
    },
    async execute(
      _id: string,
      params: { service: string; method: string; args?: string },
    ): Promise<ToolResponse> {
      // eslint-disable-next-line no-console
      console.error(
        `[discovery/service_call] ENTER service=${JSON.stringify(params.service)} method=${JSON.stringify(params.method)}\n` +
          `  args: ${params.args ?? '(none)'}\n` +
          `  state.services keys: ${[...state.services.keys()].join(', ') || '(empty)'}`,
      );
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
          parsedArgs = parsed.map((arg) => expandArtifactHandles(arg));
        }

        const result = await daemon.queueMessage({
          target: kref,
          method: params.method,
          args: parsedArgs,
        });

        // eslint-disable-next-line no-console
        console.error(
          `[discovery/service_call] IN service=${params.service} method=${params.method}\n` +
            `  raw result: ${JSON.stringify(result).slice(0, 1500)}`,
        );
        const withRegisteredRefs = registerEmbeddedRefs(result);
        // eslint-disable-next-line no-console
        console.error(
          `[discovery/service_call] after ref-walk: ${JSON.stringify(withRegisteredRefs).slice(0, 1500)}\n` +
            `  state.services keys now: ${[...state.services.keys()].join(', ')}`,
        );
        const summarised = summariseResult(withRegisteredRefs);
        // eslint-disable-next-line no-console
        console.error(
          `[discovery/service_call] slim view: ${JSON.stringify(summarised).slice(0, 1500)}`,
        );

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
        // eslint-disable-next-line no-console
        console.error(
          `[discovery/service_call] ERROR service=${JSON.stringify(params.service)} method=${JSON.stringify(params.method)}: ${message}`,
        );
        return {
          content: [{ type: 'text' as const, text: `Error: ${message}` }],
          details: undefined,
        };
      }
    },
  });

  /**
   * Walk `value` and replace every `{ __handle__: "artifact-N" }`
   * placeholder with the corresponding stored artifact's `data`
   * string. Anything else passes through unchanged. Arrays and
   * objects are walked recursively. An unresolved handle throws so
   * the caller sees a clear error instead of silently shipping a
   * placeholder to the service.
   *
   * @param value - The argument value to expand.
   * @returns The value with all handle placeholders substituted.
   */
  function expandArtifactHandles(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((entry) => expandArtifactHandles(entry));
    }
    if (typeof value !== 'object' || value === null) {
      return value;
    }
    const record = value as Record<string, unknown>;
    const handle = record.__handle__;
    if (typeof handle === 'string') {
      const stored = artifacts.get(handle);
      if (stored === undefined) {
        throw new Error(`unknown artifact handle: ${handle}`);
      }
      return stored.data;
    }
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(record)) {
      out[key] = expandArtifactHandles(val);
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
    ...(stored.receiveShipmentUrl === undefined
      ? {}
      : { receiveShipmentUrl: stored.receiveShipmentUrl }),
    ...(stored.reviser === undefined ? {} : { reviser: stored.reviser }),
  };
}
