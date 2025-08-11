import { describe, it, expect } from 'vitest';

import {
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableValue,
} from './index.ts';

describe('Table Components Index', () => {
  it('exports Table component', () => {
    expect(Table).toBeDefined();
    expect(typeof Table).toBe('function');
  });

  it('exports TableCell component', () => {
    expect(TableCell).toBeDefined();
    expect(typeof TableCell).toBe('function');
  });

  it('exports TableHead component', () => {
    expect(TableHead).toBeDefined();
    expect(typeof TableHead).toBe('function');
  });

  it('exports TableHeader component', () => {
    expect(TableHeader).toBeDefined();
    expect(typeof TableHeader).toBe('function');
  });

  it('exports TableValue component', () => {
    expect(TableValue).toBeDefined();
    expect(typeof TableValue).toBe('function');
  });

  it('exports all expected components', () => {
    expect(Table).toBeDefined();
    expect(TableCell).toBeDefined();
    expect(TableHead).toBeDefined();
    expect(TableHeader).toBeDefined();
    expect(TableValue).toBeDefined();
  });
});
