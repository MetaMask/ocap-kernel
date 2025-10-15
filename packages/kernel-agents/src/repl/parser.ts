
/* eslint-disable @typescript-eslint/naming-convention */
import Parser from 'tree-sitter';
import JavaScript from 'tree-sitter-javascript';
/* eslint-enable @typescript-eslint/naming-convention */
import type { Logger } from '@metamask/logger';
import {
  isClosed,
  hasErrors,
  isIncomplete,
} from './parser-utils.ts';
import type { IncrementalParser } from '../types.ts';

export class InvalidSyntax extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSyntax';
  }
}

export type MakeStreamValidatorArgs = {
  logger?: Logger;
};

const statementNodes = [
  'expression_statement',
  'lexical_declaration',
  'variable_declaration',
  'function_declaration',
] as const;

/**
 * Create an incremental stream validator for JavaScript code.
 *
 * @param args - The arguments to make the stream validator.
 * @param args.logger - The logger to use for the stream validator.
 * @returns A function that validates a chunk of a streaming response,
 *   returning the complete statement if parsing is complete or null otherwise.
 */
export const makeStreamValidator = ({
  logger,
}: MakeStreamValidatorArgs = {}): IncrementalParser<string> => {
  let buffer: string = '';
  const parser = new Parser();
  parser.setLanguage(JavaScript as Parser.Language);

  return (chunk: string): string | null => {
    buffer += chunk;
    
    try {
      const tree = parser.parse(buffer);
      const rootNode = tree.rootNode;
      
      const firstStatement = rootNode.children.find(child => 
        statementNodes.includes(child.type as never)
      );
      
      if (firstStatement && !firstStatement.hasError && isClosed(firstStatement, buffer)) {
        const result: string = buffer.slice(firstStatement.startIndex, firstStatement.endIndex);
        logger?.info('validated statement:', result);
        return result;
      }
      
      // Check for errors
      if (hasErrors(rootNode)) {
        if (isIncomplete(rootNode, buffer)) {
          return null; // Wait for more input
        }
        throw new InvalidSyntax('Syntax error');
      }
      
      return null;
    } catch (error: unknown) {
      if (error instanceof InvalidSyntax) throw error;
      return null;
    }
  };
};
