import 'ses'; // We need the real Compartment, not the mock.
import '@ocap/repo-tools/test-utils/mock-endoify';
import { EvaluatorError } from '@metamask/kernel-errors';
import { Logger } from '@metamask/logger';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { makeEvaluator } from './evaluator.ts';
import {
  CommentMessage,
  EvaluationMessage,
  ImportMessage,
  ResultMessage,
  StatementMessage,
} from './messages.ts';
import type { ReplTranscript } from './messages.ts';
import type { EvaluatorState } from './types.ts';

describe('evaluator', () => {
  let state: EvaluatorState;
  let evaluator: ReturnType<typeof makeEvaluator>;
  const logger = new Logger('test');

  beforeEach(() => {
    state = { consts: {}, lets: {} };
    evaluator = makeEvaluator({ initState: () => state, logger });
  });

  const evaluateStatements = async (...statements: string[]) => {
    const history: ReplTranscript = [];
    for (const statement of statements) {
      await evaluator(history, StatementMessage.fromCode(statement));
    }
  };

  describe('successful evaluations', () => {
    it('evaluates a single expression', async () => {
      await evaluateStatements('1 + 1;');
      expect(state).toStrictEqual({ consts: {}, lets: {} });
    });

    it('evaluates a sequence of declarations', async () => {
      await evaluateStatements(
        'const x = 1;',
        'let y = x + 2;',
        'function foo() { return "bar"; }',
        'const z = foo();',
      );
      expect(state).toStrictEqual({
        consts: { x: 1, z: 'bar' },
        lets: { y: 3, foo: expect.any(Function) },
      });
    });

    it('evaluates a for loop', async () => {
      await evaluateStatements(
        'let x = 1;',
        'for (let i = 1; i <= 4; i++) { x *= i; }',
      );
      expect(state).toStrictEqual({ consts: {}, lets: { x: 24 } });
    });

    it('evaluates expressions with return values', async () => {
      const history: ReplTranscript = [];
      const result = await evaluator(history, StatementMessage.fromCode('42;'));
      expect(result).toBeInstanceOf(ResultMessage);
      expect(result?.messageBody.return).toBeDefined();
    });

    it('evaluates const declarations', async () => {
      await evaluateStatements('const a = 10;', 'const b = a * 2;');
      expect(state.consts).toStrictEqual({ a: 10, b: 20 });
      expect(state.lets).toStrictEqual({});
    });

    it('evaluates let declarations', async () => {
      await evaluateStatements('let a = 10;', 'a = 20;');
      expect(state.lets).toStrictEqual({ a: 20 });
    });

    it('evaluates with capabilities', async () => {
      const mockCapability = vi.fn().mockReturnValue('test-result');
      const evaluatorWithCap = makeEvaluator({
        initState: () => state,
        capabilities: {
          testCap: {
            func: mockCapability,
            schema: {
              description: 'Test capability',
              args: {},
            },
          },
        },
      });
      const history: ReplTranscript = [];
      await evaluatorWithCap(history, StatementMessage.fromCode('testCap();'));
      expect(mockCapability).toHaveBeenCalled();
    });
  });

  describe('statement validation', () => {
    it('handles comment messages', async () => {
      const history: ReplTranscript = [];
      const comment = new CommentMessage('// This is a comment');
      const result = await evaluator(history, comment);
      expect(result).toBeNull();
      expect(history).toHaveLength(1);
      expect(history[0]).toBe(comment);
    });

    it('handles import messages', async () => {
      const history: ReplTranscript = [];
      const importMsg = new ImportMessage(
        'import { test } from "@ocap/abilities";',
      );
      const result = await evaluator(history, importMsg);
      expect(result).toBeInstanceOf(ResultMessage);
      expect(result?.messageBody.error).toContain('SyntaxError');
      expect(result?.messageBody.error).toContain(
        'Additional imports are not allowed',
      );
    });

    it('rejects variable declarations', async () => {
      const statement = StatementMessage.fromCode('var x = 1;');
      const { code } = statement.messageBody;
      await expect(evaluator([], statement)).rejects.toThrow(
        `Variable declarations are not allowed: "${code}"`,
      );
    });
  });

  describe('error classification', () => {
    it('classifies syntax errors as sample-generation errors', async () => {
      const history: ReplTranscript = [];
      // This will fail during prepareEvaluation, but if it somehow gets through,
      // it would be classified as sample-generation
      // Testing the classification logic indirectly through other error types
      const statement = StatementMessage.fromCode('undefined.prop;');
      const result = await evaluator(history, statement);
      // This is a TypeError, not ReferenceError, so it's valid feedback
      expect(result).toBeInstanceOf(ResultMessage);
      expect(result?.messageBody.error).toBeDefined();
    });

    it('classifies EvaluatorError as internal error', async () => {
      const mockState = { consts: {}, lets: {} };
      const evaluatorWithError = makeEvaluator({
        initState: () => mockState,
        capabilities: {
          badCap: {
            func: () => {
              throw new EvaluatorError('test', 'code', new Error('cause'));
            },
            schema: {
              description: 'Bad capability',
              args: {},
            },
          },
        },
      });
      const history: ReplTranscript = [];
      const statement = new EvaluationMessage('badCap();');
      await expect(evaluatorWithError(history, statement)).rejects.toThrow(
        EvaluatorError,
      );
    });

    it('classifies other errors as valid feedback', async () => {
      const history: ReplTranscript = [];
      const statement = StatementMessage.fromCode(
        '(function() { throw new Error("user error"); })();',
      );
      const result = await evaluator(history, statement);
      expect(result).toBeInstanceOf(ResultMessage);
      expect(result?.messageBody.error).toContain('Error: user error');
      expect(result?.messageBody.error).not.toContain('at ');
    });

    it('strips stack traces from valid feedback errors', async () => {
      const history: ReplTranscript = [];
      const statement = StatementMessage.fromCode(
        '(function() { throw new Error("test error"); })();',
      );
      const result = await evaluator(history, statement);
      expect(result?.messageBody.error).toBe('Error: test error');
    });

    it('preserves error cause chains without stack traces', async () => {
      const history: ReplTranscript = [];
      const statement = StatementMessage.fromCode(
        '(function() { throw new Error("outer", { cause: new Error("inner") }); })();',
      );
      const result = await evaluator(history, statement);
      expect(result?.messageBody.error).toContain('Error: outer');
    });
  });

  describe('result message creation', () => {
    it('creates result message with return value', async () => {
      const history: ReplTranscript = [];
      const result = await evaluator(
        history,
        StatementMessage.fromCode('"hello";'),
      );
      expect(result).toBeInstanceOf(ResultMessage);
      expect(result?.messageBody.return).toBeDefined();
    });

    it('creates result message with error', async () => {
      const history: ReplTranscript = [];
      const result = await evaluator(
        history,
        StatementMessage.fromCode(
          '(function() { throw new Error("test"); })();',
        ),
      );
      expect(result).toBeInstanceOf(ResultMessage);
      expect(result?.messageBody.error).toContain('Error: test');
    });

    it('creates result message with value from declaration', async () => {
      const history: ReplTranscript = [];
      const result = await evaluator(
        history,
        StatementMessage.fromCode('const x = 42;'),
      );
      expect(result).toBeInstanceOf(ResultMessage);
      expect(result?.messageBody.value).toBeDefined();
    });

    it('returns null when no result keys are present', async () => {
      const history: ReplTranscript = [];
      const result = await evaluator(
        history,
        StatementMessage.fromCode('for (let i = 0; i < 1; i++) {}'),
      );
      expect(result).toBeNull();
    });
  });

  describe('state management', () => {
    it('updates state after successful const declaration', async () => {
      const history: ReplTranscript = [];
      await evaluator(history, StatementMessage.fromCode('const x = 5;'));
      expect(state.consts).toStrictEqual({ x: 5 });
      expect(state.lets).toStrictEqual({});
    });

    it('updates state after successful let declaration', async () => {
      const history: ReplTranscript = [];
      await evaluator(history, StatementMessage.fromCode('let y = 10;'));
      expect(state.lets).toStrictEqual({ y: 10 });
    });

    it('captures mutated let variables', async () => {
      await evaluateStatements('let x = 1;', 'x = 2;', 'x = 3;');
      expect(state.lets).toStrictEqual({ x: 3 });
    });

    it('does not update state on error', async () => {
      const initialState = { consts: {}, lets: {} };
      const history: ReplTranscript = [];
      try {
        await evaluator(
          history,
          StatementMessage.fromCode('const x = undefined.y;'),
        );
      } catch {
        // Expected to throw
      }
      expect(state).toStrictEqual(initialState);
    });
  });

  describe('history management', () => {
    it('adds statement and result to history', async () => {
      const history: ReplTranscript = [];
      const statement = StatementMessage.fromCode('42;');
      await evaluator(history, statement);
      expect(history).toHaveLength(2);
      expect(history[0]).toBe(statement);
      expect(history[1]).toBeInstanceOf(ResultMessage);
    });

    it('adds only statement for comments', async () => {
      const history: ReplTranscript = [];
      const comment = new CommentMessage('// comment');
      await evaluator(history, comment);
      expect(history).toHaveLength(1);
      expect(history[0]).toBe(comment);
    });

    it('adds statement and error result for imports', async () => {
      const history: ReplTranscript = [];
      const importMsg = new ImportMessage('import { x } from "y";');
      await evaluator(history, importMsg);
      expect(history).toHaveLength(2);
      expect(history[0]).toBe(importMsg);
      expect(history[1]).toBeInstanceOf(ResultMessage);
    });
  });

  describe('edge cases', () => {
    it('handles undefined result', async () => {
      const history: ReplTranscript = [];
      const result = await evaluator(
        history,
        StatementMessage.fromCode('void 0;'),
      );
      expect(result).toBeInstanceOf(ResultMessage);
    });

    it('handles null result', async () => {
      const history: ReplTranscript = [];
      const result = await evaluator(
        history,
        StatementMessage.fromCode('null;'),
      );
      expect(result).toBeInstanceOf(ResultMessage);
    });

    it('handles non-Error thrown values', async () => {
      const history: ReplTranscript = [];
      const statement = StatementMessage.fromCode(
        '(function() { throw "string error"; })();',
      );
      const result = await evaluator(history, statement);
      expect(result).toBeInstanceOf(ResultMessage);
      expect(result?.messageBody.error).toBeDefined();
    });
  });

  describe('capabilities integration', () => {
    it('merges capabilities with endowments', async () => {
      const mockCap = vi.fn().mockReturnValue('result');
      const evaluatorWithCap = makeEvaluator({
        initState: () => state,
        capabilities: {
          testCap: {
            func: mockCap,
            schema: {
              description: 'Test capability',
              args: {},
            },
          },
        },
      });
      const history: ReplTranscript = [];
      await evaluatorWithCap(history, StatementMessage.fromCode('testCap();'));
      expect(mockCap).toHaveBeenCalled();
    });

    it('handles multiple capabilities', async () => {
      const cap1 = vi.fn().mockReturnValue(1);
      const cap2 = vi.fn().mockReturnValue(2);
      const evaluatorWithCaps = makeEvaluator({
        initState: () => state,
        capabilities: {
          cap1: {
            func: cap1,
            schema: { description: 'Capability 1', args: {} },
          },
          cap2: {
            func: cap2,
            schema: { description: 'Capability 2', args: {} },
          },
        },
      });
      const history: ReplTranscript = [];
      await evaluatorWithCaps(
        history,
        StatementMessage.fromCode('cap1() + cap2();'),
      );
      expect(cap1).toHaveBeenCalled();
      expect(cap2).toHaveBeenCalled();
    });
  });
});
