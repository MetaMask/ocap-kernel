import { describe, it, expect } from 'vitest';
import {
  isClosed,
  hasErrors,
  isIncomplete,
  findErrors,
} from './parser-utils.ts';
import type { SyntaxNode } from 'tree-sitter';

const makeMockNode = (args: {
  type: string,
  startIndex?: number,
  endIndex?: number,
  children?: SyntaxNode[],
}): SyntaxNode => ({
  ...args,
  tree: null,
  id: 0,
  typeId: 0,
} as unknown as SyntaxNode);

describe('parser-utils', () => {
  describe('isClosed', () => {
    it('should return true for variable declaration with semicolon', () => {
      const mockNode = makeMockNode({
        type: 'variable_declaration',
        startIndex: 0,
        endIndex: 10,
      });
      const buffer = 'let x = 5;';
      expect(isClosed(mockNode, buffer)).toBe(true);
    });

    it('should return false for variable declaration without semicolon', () => {
      const mockNode = makeMockNode({
        type: 'variable_declaration',
        startIndex: 0,
        endIndex: 8,
      });
      const buffer = 'let x = 5';
      expect(isClosed(mockNode, buffer)).toBe(false);
    });

    it('should return true for function declaration with statement block', () => {
      const mockNode = makeMockNode({
        type: 'function_declaration',
        startIndex: 0,
        endIndex: 20,
        children: [
          makeMockNode({ type: 'statement_block' }),
          makeMockNode({ type: 'other' }),
        ],
      });
      const buffer = 'function test() { }';
      expect(isClosed(mockNode, buffer)).toBe(true);
    });

    it('should return false for function declaration without statement block', () => {
      const mockNode = makeMockNode({
        type: 'function_declaration',
        startIndex: 0,
        endIndex: 15,
        children: [
          makeMockNode({ type: 'other' }),
        ],
      });
      const buffer = 'function test()';
      expect(isClosed(mockNode, buffer)).toBe(false);
    });

    it('should handle whitespace in buffer', () => {
      const mockNode = makeMockNode({
        type: 'variable_declaration',
        startIndex: 0,
        endIndex: 12,
      });
      const buffer = 'let x = 5;  ';
      expect(isClosed(mockNode, buffer)).toBe(true);
    });
  });

  describe('hasErrors', () => {
    it('should return true for ERROR node', () => {
      const mockNode = makeMockNode({
        type: 'ERROR',
        children: [],
      });
      expect(hasErrors(mockNode)).toBe(true);
    });

    it('should return false for non-ERROR node with no children', () => {
      const mockNode = makeMockNode({
        type: 'variable_declaration',
        children: [],
      });
      expect(hasErrors(mockNode)).toBe(false);
    });

    it('should return true when child has ERROR', () => {
      const mockNode = makeMockNode({
        type: 'program',
        children: [
          makeMockNode({ type: 'ERROR', children: [] }),
          makeMockNode({ type: 'variable_declaration', children: [] }),
        ],
      });
      expect(hasErrors(mockNode)).toBe(true);
    });

    it('should return false when no children have ERROR', () => {
      const mockNode = makeMockNode({
        type: 'program',
        children: [
          makeMockNode({ type: 'variable_declaration', children: [] }),
          makeMockNode({ type: 'expression_statement', children: [] }),
        ],
      });
      expect(hasErrors(mockNode)).toBe(false);
    });

    it('should recursively check nested children', () => {
      const mockNode = makeMockNode({
        type: 'program',
        children: [
          makeMockNode({
            type: 'variable_declaration',
            children: [
              makeMockNode({ type: 'ERROR', children: [] }),
            ],
          }),
        ],
      });
      expect(hasErrors(mockNode)).toBe(true);
    });
  });

  describe('isIncomplete', () => {
    it('should return false when no errors', () => {
      const mockNode = makeMockNode({
        type: 'program',
        children: [],
      });
      const buffer = 'let x = 5;';
      expect(isIncomplete(mockNode, buffer)).toBe(false);
    });

    it('should return true when error is at end of buffer', () => {
      const mockNode = makeMockNode({
        type: 'program',
        children: [
          makeMockNode({
            type: 'ERROR',
            startIndex: 0,
            endIndex: 8,
            children: [],
          }),
        ],
      });
      const buffer = 'let x = ';
      expect(isIncomplete(mockNode, buffer)).toBe(true);
    });

    it('should return false when error is not at end of buffer', () => {
      const mockNode = makeMockNode({
        type: 'program',
        children: [
          makeMockNode({
            type: 'ERROR',
            startIndex: 0,
            endIndex: 8,
            children: [],
          }),
        ],
      });
      const buffer = 'let x = ; let y = 5;';
      expect(isIncomplete(mockNode, buffer)).toBe(false);
    });

    it('should handle multiple errors and check the last one', () => {
      const mockNode = makeMockNode({
        type: 'program',
        children: [
          makeMockNode({
            type: 'ERROR',
            startIndex: 0,
            endIndex: 5,
            children: [],
          }),
          makeMockNode({
            type: 'ERROR',
            startIndex: 10,
            endIndex: 15,
            children: [],
          }),
        ],
      });
      const buffer = 'let x = ; let y = ';
      // The last error ends at index 15, and buffer length is 18, so there's content after the error
      expect(isIncomplete(mockNode, buffer)).toBe(false);
    });
  });

  describe('findErrors', () => {
    it('should return empty array for node without errors', () => {
      const mockNode = makeMockNode({
        type: 'program',
        children: [
          makeMockNode({ type: 'variable_declaration', children: [] }),
        ],
      });
      expect(findErrors(mockNode)).toStrictEqual([]);
    });

    it('should return single ERROR node', () => {
      const errorNode = makeMockNode({ type: 'ERROR', children: [] });
      const mockNode = makeMockNode({
        type: 'program',
        children: [errorNode],
      });
      expect(findErrors(mockNode)).toStrictEqual([errorNode]);
    });

    it('should return multiple ERROR nodes', () => {
      const errorNode1 = makeMockNode({ type: 'ERROR', children: [] });
      const errorNode2 = makeMockNode({ type: 'ERROR', children: [] });
      const mockNode = makeMockNode({
        type: 'program',
        children: [errorNode1, errorNode2],
      });
      expect(findErrors(mockNode)).toStrictEqual([errorNode1, errorNode2]);
    });

    it('should recursively find nested ERROR nodes', () => {
      const errorNode1 = makeMockNode({ type: 'ERROR', children: [] });
      const errorNode2 = makeMockNode({ type: 'ERROR', children: [] });
      const mockNode = makeMockNode({
        type: 'program',
        children: [
          makeMockNode({
            type: 'variable_declaration',
            children: [errorNode1],
          }),
          errorNode2,
        ],
      });
      expect(findErrors(mockNode)).toStrictEqual([errorNode1, errorNode2]);
    });
  });
});
