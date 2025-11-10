/**
 * This suite declares expected AST nodes for various JavaScript expressions.
 */
import '@ocap/repo-tools/test-utils/mock-endoify';
import { Logger } from '@metamask/logger';
import type { SyntaxNode } from 'tree-sitter';
import { describe, it, expect } from 'vitest';

import { parse } from './javascript.ts';

const logger = new Logger('js-parser-test');

describe('javascript parser', () => {
  it.each([
    // An array of expected proposals from the LLM and their AST types.
    ['const a = 1;', 'lexical_declaration'],
    ['let { b } = { b: 2 };', 'lexical_declaration'],
    ['var [ c ] = [ 3 ];', 'variable_declaration'],
    ['const x = () => 42;', 'lexical_declaration'],
    ['function y() { return 42; }', 'function_declaration'],
    ['function* z() { yield 42; }', 'generator_function_declaration'],
    ['1 + 1', 'expression_statement'],
    ['for (let i = 0; i < 4; i++) { console.log(i); }', 'for_statement'],
    ['(function() { return 42; })()', 'expression_statement'],
    // Note: the below case becomes a function_declaration once the body closes.
    ['function test() {', 'expression_statement'],
    ['let length = 11, width = 47, height = 63;', 'lexical_declaration'],
    ['// This is a comment', 'comment'],
    ['import { foo } from "@ocap/abilities";', 'import_statement'],
  ])('parses `%s` as %s', (expression: string, expectedType: string) => {
    const tree = parse(expression);
    const { rootNode } = tree;
    expect(rootNode.text).toStrictEqual(expression);
    expect(rootNode.type).toBe('program');
    expect(rootNode.children).toHaveLength(1);
    logger.info(rootNode.toString());
    const [child] = rootNode.children as [SyntaxNode];
    expect(child.text).toStrictEqual(expression);
    expect(child.type).toBe(expectedType);
  });
});
