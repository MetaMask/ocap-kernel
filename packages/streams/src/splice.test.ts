import { describe, expect, it, vi } from 'vitest';

import { splice } from './splice.ts';
import { TestDuplexStream } from '../test/stream-mocks.ts';

describe('splice', () => {
  it('should forward values to the correct sub-stream', async () => {
    const stream = await TestDuplexStream.make<string>(() => undefined);
    const [streamA, streamB] = splice(
      stream,
      (value) => value === 'a',
      (value) => value === 'b',
    );
    await stream.receiveInput('a');
    await stream.receiveInput('b');
    await stream.end();

    expect(await stream.next()).toStrictEqual({ done: true, value: undefined });
    expect(await streamA.next()).toStrictEqual({ done: false, value: 'a' });
    expect(await streamB.next()).toStrictEqual({ done: false, value: 'b' });
    expect(await streamA.next()).toStrictEqual({
      done: true,
      value: undefined,
    });
    expect(await streamB.next()).toStrictEqual({
      done: true,
      value: undefined,
    });
  });

  it('should end the sub-streams when the parent stream ends', async () => {
    const stream = await TestDuplexStream.make<string>(() => undefined);
    const [streamA, streamB] = splice(
      stream,
      (value) => value === 'a',
      (value) => value === 'b',
    );
    await stream.end();

    expect(await stream.next()).toStrictEqual({ done: true, value: undefined });
    expect(await streamA.next()).toStrictEqual({
      done: true,
      value: undefined,
    });
    expect(await streamB.next()).toStrictEqual({
      done: true,
      value: undefined,
    });
  });

  it('should end all streams when a sub-stream ends', async () => {
    const stream = await TestDuplexStream.make<string>(() => undefined);
    const [streamA, streamB] = splice(
      stream,
      (value) => value === 'a',
      (value) => value === 'b',
    );
    await streamA.return();

    expect(await stream.next()).toStrictEqual({ done: true, value: undefined });
    expect(await streamA.next()).toStrictEqual({
      done: true,
      value: undefined,
    });
    expect(await streamB.next()).toStrictEqual({
      done: true,
      value: undefined,
    });
  });

  it('should forward errors', async () => {
    const stream = await TestDuplexStream.make<string>(() => undefined);
    const [streamA, streamB] = splice(
      stream,
      (value) => value === 'a',
      (value) => value === 'b',
    );
    const nextA = streamA.next();
    const nextB = streamB.next();
    await stream.throw(new Error('test'));

    expect(await stream.next()).toStrictEqual({ done: true, value: undefined });
    await expect(nextA).rejects.toThrow('test');
    await expect(nextB).rejects.toThrow('test');
  });

  it('should end all streams when a sub-stream errors', async () => {
    const stream = await TestDuplexStream.make<string>(() => undefined);
    const [streamA, streamB] = splice(
      stream,
      (value) => value === 'a',
      (value) => value === 'b',
    );
    const nextA = streamA.next();
    const nextB = streamB.next();
    await streamA.throw(new Error('test'));

    // We can't observe the error from the parent stream because it's being read
    // in the body of splice().
    expect(await stream.next()).toStrictEqual({ done: true, value: undefined });
    await expect(nextA).rejects.toThrow('test');
    await expect(nextB).rejects.toThrow('test');
  });

  it('should error if no predicates match', async () => {
    const stream = await TestDuplexStream.make<string>(() => undefined);
    const [streamA, streamB] = splice(
      stream,
      (value) => value === 'a',
      (value) => value === 'b',
    );
    const nextA = streamA.next();
    const nextB = streamB.next();
    await stream.receiveInput('c');

    expect(await stream.next()).toStrictEqual({ done: true, value: undefined });
    await expect(nextA).rejects.toThrow(
      'Failed to match any predicate for value: "c"',
    );
    await expect(nextB).rejects.toThrow(
      'Failed to match any predicate for value: "c"',
    );
  });

  it('should allow writing to the sub-streams', async () => {
    const dispatch = vi.fn();
    const stream = await TestDuplexStream.make<string>(dispatch);
    const [streamA, streamB] = splice(
      stream,
      (value) => value === 'a',
      (value) => value === 'b',
    );
    await streamA.write('a');
    await streamB.write('b');
    await stream.end();

    // The important thing is that the calls are sequential
    expect(dispatch).toHaveBeenNthCalledWith(3, 'a');
    expect(dispatch).toHaveBeenNthCalledWith(4, 'b');
  });

  it('should allow draining sub-streams', async () => {
    const stream = await TestDuplexStream.make<string>(() => undefined);
    const [streamA, streamB] = splice(
      stream,
      (value) => value === 'a',
      (value) => value === 'b',
    );
    await streamA.write('a');
    await streamB.write('b');
    await stream.end();

    await streamA.drain((value) => {
      expect(value).toBe('a');
    });
    await streamB.drain((value) => {
      expect(value).toBe('b');
    });
  });

  it('should allow iterating over the sub-streams', async () => {
    const stream = await TestDuplexStream.make<string>(() => undefined);
    const [streamA, streamB] = splice(
      stream,
      (value) => value === 'a',
      (value) => value === 'b',
    );
    await streamA.write('a');
    await streamB.write('b');
    await stream.end();

    for await (const value of streamA) {
      expect(value).toBe('a');
    }
    for await (const value of streamB) {
      expect(value).toBe('b');
    }
  });

  it('should allow piping the sub-streams to a sink', async () => {
    const stream = await TestDuplexStream.make<string>(() => undefined);
    const sinkDispatch = vi.fn();
    const sink = await TestDuplexStream.make<string>(sinkDispatch);
    const [streamA, streamB] = splice(
      stream,
      (value) => value === 'a',
      (value) => value === 'b',
    );
    await stream.receiveInput('a');
    await stream.receiveInput('b');
    await stream.end();
    await streamA.pipe(sink);
    await streamB.pipe(sink);
    await sink.end();

    expect(sinkDispatch).toHaveBeenNthCalledWith(3, 'a');
    expect(sinkDispatch).toHaveBeenNthCalledWith(4, 'b');
  });
});
