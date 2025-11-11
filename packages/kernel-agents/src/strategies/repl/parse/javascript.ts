/* eslint-disable @typescript-eslint/naming-convention */
import Parser from 'tree-sitter';
import JavaScript from 'tree-sitter-javascript';
/* eslint-enable @typescript-eslint/naming-convention */

const parser = new Parser();
parser.setLanguage(JavaScript as Parser.Language);

/**
 * Parse a JavaScript statement into a tree-sitter abstract syntax tree.
 *
 * @param text - The text to parse.
 * @returns The parsed tree-sitter abstract syntax tree.
 */
export const parse = (text: string): Parser.Tree => parser.parse(text);
