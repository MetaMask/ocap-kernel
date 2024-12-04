import { object, string, array, is } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

import type { TypeGuard } from './types.js';

export const MethodSchemaStruct = object({
  name: string(),
  parameters: array(string()),
});

export type MethodSchema = Infer<typeof MethodSchemaStruct>;

/**
 * Extract parameter names from a function string.
 *
 * @param funcStr - The function string to parse.
 * @returns Array of parameter names.
 */
function extractParameters(funcStr: string): string[] {
  // Match the parameter list inside parentheses
  const paramMatch = funcStr.match(/\(([\s\S]*?)\)/u);
  if (!paramMatch?.[1]) {
    return [];
  }

  const paramList = paramMatch[1].trim();

  return paramList.split(',').map((param: string) => {
    const cleanParam = param.trim();
    return (
      // Remove default values and type annotations
      cleanParam.split('=')[0]?.split(':')[0]?.replace('?', '').trim() as string
    );
  });
}

/**
 * Generate method schemas from an object containing methods.
 *
 * @param methods - Object containing methods to generate schemas for.
 * @returns Array of method schemas.
 */
export function generateMethodSchema(
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  methods: Record<string, Function>,
): MethodSchema[] {
  return Object.entries(methods).map(([name, func]) => {
    const funcStr = func.toString();
    const parameters = extractParameters(funcStr);

    return {
      name,
      parameters,
    };
  });
}

export const isMethodSchema: TypeGuard<MethodSchema> = (
  value: unknown,
): value is MethodSchema => {
  return is(value, MethodSchemaStruct);
};
