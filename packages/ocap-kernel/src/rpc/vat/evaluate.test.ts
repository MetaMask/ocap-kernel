import { describe, it, expect, vi } from 'vitest';

import { evaluateHandler } from './evaluate.ts';
import type { HandleEvaluate } from './evaluate.ts';

describe('evaluateHandler', () => {
  it('calls handleEvaluate with the code parameter', () => {
    const handleEvaluate = vi.fn(() => ({
      success: true as const,
      value: 42,
    }));
    const result = evaluateHandler.implementation(
      { handleEvaluate },
      { code: '1 + 1' },
    );
    expect(result).toStrictEqual({ success: true, value: 42 });
    expect(handleEvaluate).toHaveBeenCalledWith('1 + 1');
  });

  it('returns success result with value', () => {
    const handleEvaluate: HandleEvaluate = () => ({
      success: true,
      value: { foo: 'bar' },
    });
    const result = evaluateHandler.implementation(
      { handleEvaluate },
      { code: 'test' },
    );
    expect(result).toStrictEqual({ success: true, value: { foo: 'bar' } });
  });

  it('returns success result without value for undefined', () => {
    const handleEvaluate: HandleEvaluate = () => ({
      success: true,
    });
    const result = evaluateHandler.implementation(
      { handleEvaluate },
      { code: 'undefined' },
    );
    expect(result).toStrictEqual({ success: true });
  });

  it('returns error result for failures', () => {
    const handleEvaluate: HandleEvaluate = () => ({
      success: false,
      error: 'SyntaxError: Unexpected token',
    });
    const result = evaluateHandler.implementation(
      { handleEvaluate },
      { code: 'invalid{code' },
    );
    expect(result).toStrictEqual({
      success: false,
      error: 'SyntaxError: Unexpected token',
    });
  });
});
