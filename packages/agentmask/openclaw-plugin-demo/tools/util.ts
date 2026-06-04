import type { ToolResponse } from '../types.ts';

/**
 * Wrap an error message in the openclaw `ToolResponse` shape so tools
 * can return user-legible errors without throwing. The agent sees the
 * full message verbatim.
 *
 * @param message - The error text to surface to the agent.
 * @returns A ToolResponse with a single text content block.
 */
export function errorResponse(message: string): ToolResponse {
  return {
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
    details: undefined,
  };
}
