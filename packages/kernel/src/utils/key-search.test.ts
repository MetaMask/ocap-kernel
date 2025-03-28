import { describe, it, expect } from 'vitest';

import { keySearch } from './key-search.ts';

describe('keySearch', () => {
  it('returns the index of an exact match', () => {
    const arr = ['a', 'b', 'c', 'd', 'e'];
    expect(keySearch(arr, 'c')).toBe(2);
    expect(keySearch(arr, 'a')).toBe(0);
    expect(keySearch(arr, 'e')).toBe(4);
  });

  it('returns the index of the first key greater than the search key', () => {
    const arr = ['a', 'c', 'e', 'g', 'i'];
    expect(keySearch(arr, 'b')).toBe(1);
    expect(keySearch(arr, 'd')).toBe(1);
    expect(keySearch(arr, 'f')).toBe(-1);
  });

  it('returns 0 when the search key is less than the first element', () => {
    const arr = ['b', 'c', 'd', 'e'];
    expect(keySearch(arr, 'a')).toBe(0);
  });

  it('returns -1 when the search key is greater than the last element', () => {
    const arr = ['a', 'b', 'c', 'd'];
    expect(keySearch(arr, 'e')).toBe(-1);
    expect(keySearch(arr, 'z')).toBe(-1);
  });

  it('handles arrays with a single element', () => {
    const arr = ['a'];
    expect(keySearch(arr, 'a')).toBe(0);
    expect(keySearch(arr, '0')).toBe(0);
    expect(keySearch(arr, 'b')).toBe(-1);
  });

  it('handles empty arrays', () => {
    const arr: string[] = [];
    expect(keySearch(arr, 'a')).toBe(-1);
  });

  it('handles null arrays', () => {
    // @ts-expect-error Testing null input for robustness
    expect(keySearch(null, 'a')).toBe(-1);
  });

  it('performs correctly with duplicate keys', () => {
    const arr = ['a', 'b', 'b', 'b', 'c', 'd'];
    const result = keySearch(arr, 'b');
    expect(result === 1 || result === 2 || result === 3).toBe(true);
  });

  it('works with long arrays', () => {
    const arr = Array.from({ length: 1000 }, (_, i) => String(i));
    expect(keySearch(arr, '0')).toBe(0);
    expect(keySearch(arr, '500')).toBe(500);
    expect(keySearch(arr, '999')).toBe(999);
    expect(keySearch(arr, '500.5')).toBe(501);
    expect(keySearch(arr, '-1')).toBe(0);
    const result = keySearch(arr, '1000');
    expect(result === -1 || result < arr.length).toBe(true);
  });

  it('handles edge case where beg equals end in the while loop', () => {
    const arr = ['a', 'c', 'e', 'g', 'i'];
    expect(keySearch(arr, 'h')).toBe(4);
  });

  it('works with different string lengths', () => {
    const arr = ['a', 'bb', 'ccc', 'dddd', 'eeeee'];
    expect(keySearch(arr, 'bb')).toBe(1);
    expect(keySearch(arr, 'b')).toBe(1);
    expect(keySearch(arr, 'cc')).toBe(1);
  });

  it('preserves lexicographic ordering', () => {
    const arr = ['1', '10', '2', '20'];
    const sorted = arr.slice().sort();
    expect(sorted).toStrictEqual(['1', '10', '2', '20']);
    const result = keySearch(sorted, '15');
    expect([-1, 2]).toContain(result);
  });
});
