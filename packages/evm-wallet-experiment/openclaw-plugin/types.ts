export type ToolResponse = { content: { type: 'text'; text: string }[] };

export type OpenClawPluginApi = {
  pluginConfig?: Record<string, unknown>;
  registerTool: (
    tool: {
      name: string;
      label: string;
      description: string;
      parameters: Record<string, unknown>;
      // Plugin framework calls execute() with dynamic tool-specific params.
      // Each tool narrows internally; the boundary type must accept any shape.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      execute: (...args: any[]) => Promise<ToolResponse>;
    },
    options: { optional: boolean },
  ) => void;
};
