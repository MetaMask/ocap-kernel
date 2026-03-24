export type { OpenClawPluginApi } from 'openclaw/plugin-sdk/plugin-entry';

/**
 * Tool response matching AgentToolResult<undefined> from the OpenClaw SDK.
 * Defined inline to avoid importing transitive dependencies.
 */
export type ToolResponse = {
  content: { type: 'text'; text: string }[];
  details: undefined;
};
