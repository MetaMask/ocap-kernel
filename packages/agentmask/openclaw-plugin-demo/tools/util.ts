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

/**
 * Format an amount denominated in integer USD cents as a dollar
 * string with two decimal places and thousands separators. The
 * wallet vat, the sample-services `payment` argument, and the
 * plugin-emitted `wallet.*` events all work in cents; the LLM- and
 * audience-facing text is dollar-and-cents, so every crossing back
 * to human eyes runs through this helper.
 *
 * @param cents - The USD amount in integer cents.
 * @returns The formatted string, e.g. `"$22.50"` or `"$1,200.00"`.
 */
export function formatUsdFromCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Decode literal `\uXXXX` escape sequences in a string back to their
 * unicode code points. Applied to LLM-authored text at the tool
 * boundary: some model versions (notably Opus 4.8 in tool-call
 * mode) emit non-ASCII characters as literal 6-character
 * backslash-u escapes in their JSON tool-call args rather than the
 * bare unicode character. openclaw's JSON parser deserializes each
 * `\uXXXX` in the tool-call args to the corresponding character
 * correctly — but if the model emits the escape as `\\u2014` (i.e.
 * a literal backslash followed by `u2014`), the JSON parser
 * decodes that to the six characters `—` in the JS string,
 * which then displays verbatim in the dashboard.
 *
 * This helper reverses the model's over-escaping. Strings that
 * already contain the correct unicode character pass through
 * unchanged.
 *
 * Handles the common BMP case with a single regex substitution;
 * that's sufficient for the em-dash / en-dash / smart-quote /
 * emoji cases that surface in producer narration.
 *
 * @param text - The raw string received in a tool-call arg.
 * @returns The string with literal `\uXXXX` sequences replaced.
 */
export function decodeLiteralUnicodeEscapes(text: string): string {
  return text.replace(/\\u([0-9a-fA-F]{4})/gu, (_match, hexCode: string) =>
    String.fromCharCode(parseInt(hexCode, 16)),
  );
}
