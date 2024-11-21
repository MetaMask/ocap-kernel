import { describe, it, expect, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-shadow
import { TransformStream } from './TransformStream.js';
import { delay } from '../../test-utils/src/delay.js';
import { TestDuplexStream } from '../../test-utils/src/streams.js';

describe('TransformStream', () => {
  it('should transform values', async () => {
    const stream = new TransformStream<number, number>((value) => value + 1);
    await stream.write(1);
    await stream.write(2);
    await stream.write(3);
    await stream.end();

    for (const expectedValue of [2, 3, 4]) {
      const result = await stream.next();
      expect(result.value).toStrictEqual(expectedValue);
    }
  });

  it('can be piped to another stream', async () => {
    const transformStream = new TransformStream<number, number>(
      (value) => value + 1,
    );
    const onDispatch = vi.fn();
    const duplexStream = await TestDuplexStream.make(onDispatch);
    const pipeP = transformStream.pipe(duplexStream);

    await transformStream.write(1);
    await transformStream.write(2);
    await transformStream.write(3);
    await transformStream.end();
    await pipeP;

    expect(onDispatch).toHaveBeenCalledWith(2);
    expect(onDispatch).toHaveBeenCalledWith(3);
    expect(onDispatch).toHaveBeenLastCalledWith(4);
  });

  it('can be piped to', async () => {
    const source = await TestDuplexStream.make();

    const transformStream = new TransformStream<number, number>(
      (value) => value + 1,
    );

    const pipeP = source.pipe(transformStream);

    await source.receiveInput(1);
    await source.receiveInput(2);
    await source.receiveInput(3);
    await source.end();
    await pipeP;

    for (const expectedValue of [2, 3, 4]) {
      const result = await transformStream.next();
      expect(result.value).toStrictEqual(expectedValue);
    }
  });

  it('can form a stream pipeline', async () => {
    const source = await TestDuplexStream.make();
    const transformStream = new TransformStream<number, number>(
      (value) => value + 1,
    );
    const onDispatch = vi.fn();
    const destination = await TestDuplexStream.make(onDispatch);

    const pipelineP = Promise.all([
      source.pipe(transformStream),
      transformStream.pipe(destination),
    ]);

    await source.receiveInput(1);
    await source.receiveInput(2);
    await source.receiveInput(3);
    await delay(10);
    await Promise.all([source.end(), transformStream.end(), pipelineP]);

    expect(onDispatch).toHaveBeenCalledWith(2);
    expect(onDispatch).toHaveBeenCalledWith(3);
    expect(onDispatch).toHaveBeenLastCalledWith(4);
  });
});
