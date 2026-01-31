import { describe, it, expect, vi } from 'vitest';

import { makeFacet } from './make-facet.ts';

describe('makeFacet', () => {
  const makeSourceObject = () => ({
    method1: vi.fn().mockReturnValue('result1'),
    method2: vi.fn().mockReturnValue('result2'),
    method3: vi.fn().mockReturnValue('result3'),
    asyncMethod: vi.fn().mockResolvedValue('asyncResult'),
  });

  it('creates a facet with only specified methods', () => {
    const source = makeSourceObject();

    const facet = makeFacet('TestFacet', source, ['method1', 'method2']);

    expect(facet.method1).toBeDefined();
    expect(facet.method2).toBeDefined();
    expect((facet as Record<string, unknown>).method3).toBeUndefined();
    expect((facet as Record<string, unknown>).asyncMethod).toBeUndefined();
  });

  it('facet methods call the source methods', () => {
    const source = makeSourceObject();

    const facet = makeFacet('TestFacet', source, ['method1']);
    facet.method1();

    expect(source.method1).toHaveBeenCalledOnce();
  });

  it('facet methods return the same result as source', () => {
    const source = makeSourceObject();

    const facet = makeFacet('TestFacet', source, ['method1']);
    const result = facet.method1();

    expect(result).toBe('result1');
  });

  it('facet methods pass arguments to source', () => {
    const source = makeSourceObject();

    const facet = makeFacet('TestFacet', source, ['method1']);
    facet.method1('arg1', 'arg2');

    expect(source.method1).toHaveBeenCalledWith('arg1', 'arg2');
  });

  it('works with async methods', async () => {
    const source = makeSourceObject();

    const facet = makeFacet('TestFacet', source, ['asyncMethod']);
    const result = await facet.asyncMethod();

    expect(result).toBe('asyncResult');
    expect(source.asyncMethod).toHaveBeenCalledOnce();
  });

  it('creates facet with single method', () => {
    const source = makeSourceObject();

    const facet = makeFacet('SingleMethodFacet', source, ['method1']);

    expect(facet.method1).toBeDefined();
    // Verify only the specified method is accessible
    expect((facet as Record<string, unknown>).method2).toBeUndefined();
    expect((facet as Record<string, unknown>).method3).toBeUndefined();
  });

  it('creates facet with all methods', () => {
    const source = makeSourceObject();

    const facet = makeFacet('AllMethodsFacet', source, [
      'method1',
      'method2',
      'method3',
      'asyncMethod',
    ]);

    expect(facet.method1).toBeDefined();
    expect(facet.method2).toBeDefined();
    expect(facet.method3).toBeDefined();
    expect(facet.asyncMethod).toBeDefined();
  });

  it('throws when method does not exist on source', () => {
    const source = makeSourceObject();

    expect(() =>
      makeFacet('TestFacet', source, ['nonExistent' as keyof typeof source]),
    ).toThrow(
      "makeFacet: Method 'nonExistent' not found on source or is not a function",
    );
  });

  it('throws when property is not a function', () => {
    const source = {
      method1: vi.fn(),
      notAMethod: 'string value',
    };

    expect(() =>
      // @ts-expect-error Destructive testing
      makeFacet('TestFacet', source, ['notAMethod' as keyof typeof source]),
    ).toThrow(
      "makeFacet: Method 'notAMethod' not found on source or is not a function",
    );
  });

  it('preserves this context when methods use it', () => {
    const source = {
      value: 42,
      getValue(this: { value: number }): number {
        return this.value;
      },
    };

    const facet = makeFacet('TestFacet', source, ['getValue']);
    const result = facet.getValue();

    expect(result).toBe(42);
  });
});
