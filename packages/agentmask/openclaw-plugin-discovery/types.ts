/**
 * Tool response matching AgentToolResult<undefined> from the OpenClaw SDK.
 * Defined inline to avoid importing transitive dependencies.
 */
export type ToolResponse = {
  content: { type: 'text'; text: string }[];
  details: undefined;
};

/**
 * Minimal OpenClaw plugin API surface used by this plugin.
 * Defined locally to avoid depending on the `openclaw` package.
 */
export type OpenClawPluginApi = {
  pluginConfig?: Record<string, unknown>;
  registerTool(tool: {
    name: string;
    label: string;
    description: string;
    parameters: Record<string, unknown>;
    execute(id: string, params: Record<string, unknown>): Promise<ToolResponse>;
  }): void;
};

/**
 * Minimal config schema matching OpenClawPluginConfigSchema.
 * Has a `safeParse` validator and a `jsonSchema` descriptor.
 */
export type PluginConfigSchema = {
  safeParse(value: unknown):
    | { success: true; data?: unknown }
    | {
        success: false;
        error: { issues: { path: (string | number)[]; message: string }[] };
      };
  jsonSchema: Record<string, unknown>;
};

/**
 * Plugin entry descriptor returned by the default export.
 */
export type PluginEntry = {
  id: string;
  name: string;
  description: string;
  configSchema: PluginConfigSchema;
  register(api: OpenClawPluginApi): void;
};
