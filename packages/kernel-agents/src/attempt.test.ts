import '@ocap/repo-tools/test-utils/mock-endoify';

import type { Logger } from '@metamask/logger';
import type { LanguageModel } from '@ocap/kernel-language-model-service';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import { doAttempt } from './attempt.ts';
import { makeTestStream } from './test-utils.ts';
import type { PREP, Progress } from './types/agent.ts';
import { Message } from './types/messages.ts';

class TestMessage extends Message<string> {
  constructor(messageType: string, messageBody: Record<string, unknown> = {}) {
    super(messageType, messageBody);
  }
}

describe('doAttempt', () => {
  let mockPrompter: ReturnType<typeof vi.fn>;
  let mockReader: ReturnType<typeof vi.fn>;
  let mockEvaluator: ReturnType<typeof vi.fn>;
  let mockPrinter: ReturnType<typeof vi.fn>;
  let mockLanguageModel: {
    sample: ReturnType<typeof vi.fn>;
  };
  let mockProgress: Progress<string, TestMessage[]>;
  let prep: PREP<TestMessage[], TestMessage, TestMessage>;
  let logger: Logger;

  beforeEach(() => {
    mockPrompter = vi.fn();
    mockReader = vi.fn();
    mockEvaluator = vi.fn();
    mockPrinter = vi.fn();
    mockLanguageModel = {
      sample: vi.fn(),
    };
    logger = {
      info: vi.fn(),
      subLogger: vi.fn(() => logger),
    } as unknown as Logger;

    prep = [
      mockPrompter,
      mockReader,
      mockEvaluator,
      mockPrinter,
    ] as unknown as PREP<TestMessage[], TestMessage, TestMessage>;
  });

  it('returns result when done on first step', async () => {
    const history: TestMessage[] = [];
    const action = new TestMessage('action');
    const observation = new TestMessage('observation');
    const result = 'test result';

    mockPrompter.mockReturnValue({ prompt: 'test prompt', readerArgs: {} });
    mockLanguageModel.sample.mockResolvedValue(makeTestStream(['response']));
    mockReader.mockResolvedValue(action);
    mockEvaluator.mockResolvedValue(observation);
    mockProgress = {
      history,
      isDone: vi.fn(() => true),
      result,
    };

    const actual = await doAttempt(
      prep,
      mockProgress,
      mockLanguageModel as unknown as LanguageModel<
        unknown,
        { response: string }
      >,
      { maxSteps: 10, logger },
    );

    expect(actual).toBe(result);
    expect(mockPrompter).toHaveBeenCalledTimes(1);
    expect(mockPrompter).toHaveBeenCalledWith(history);
    expect(mockLanguageModel.sample).toHaveBeenCalledTimes(1);
    expect(mockLanguageModel.sample).toHaveBeenCalledWith('test prompt');
    expect(mockReader).toHaveBeenCalledTimes(1);
    expect(mockEvaluator).toHaveBeenCalledTimes(1);
    expect(mockEvaluator).toHaveBeenCalledWith(history, action);
    expect(mockPrinter).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('Step 1 of 10');
    expect(logger.info).toHaveBeenCalledWith('done:', result);
  });

  it('returns result after multiple steps', async () => {
    const history: TestMessage[] = [];
    const action1 = new TestMessage('action1');
    const action2 = new TestMessage('action2');
    const observation1 = new TestMessage('observation1');
    const observation2 = new TestMessage('observation2');
    const result = 'final result';

    let callCount = 0;
    mockPrompter.mockImplementation(() => ({
      // The ++ operator is exactly what we want here.
      // eslint-disable-next-line no-plusplus
      prompt: `prompt ${++callCount}`,
      readerArgs: {},
    }));
    mockLanguageModel.sample.mockResolvedValue(makeTestStream(['response']));
    mockReader.mockResolvedValueOnce(action1).mockResolvedValueOnce(action2);
    mockEvaluator
      .mockResolvedValueOnce(observation1)
      .mockResolvedValueOnce(observation2);
    mockProgress = {
      history,
      isDone: vi.fn(() => callCount === 2),
      result,
    };

    const actual = await doAttempt(
      prep,
      mockProgress,
      mockLanguageModel as unknown as LanguageModel<
        unknown,
        { response: string }
      >,
      { maxSteps: 10 },
    );

    expect(actual).toBe(result);
    expect(mockPrompter).toHaveBeenCalledTimes(2);
    expect(mockLanguageModel.sample).toHaveBeenCalledTimes(2);
    expect(mockReader).toHaveBeenCalledTimes(2);
    expect(mockEvaluator).toHaveBeenCalledTimes(2);
    expect(mockPrinter).toHaveBeenCalledTimes(1);
    expect(mockPrinter).toHaveBeenCalledWith(action1, observation1);
  });

  it('passes readerArgs to reader', async () => {
    const history: TestMessage[] = [];
    const action = new TestMessage('action');
    const observation = new TestMessage('observation');
    const readerArgs = { stop: '</|>', prefix: 'test' };

    mockPrompter.mockReturnValue({ prompt: 'test prompt', readerArgs });
    mockLanguageModel.sample.mockResolvedValue(makeTestStream(['response']));
    mockReader.mockResolvedValue(action);
    mockEvaluator.mockResolvedValue(observation);
    mockProgress = {
      history,
      isDone: vi.fn(() => true),
      result: 'result',
    };

    await doAttempt(
      prep,
      mockProgress,
      mockLanguageModel as unknown as LanguageModel<
        unknown,
        { response: string }
      >,
      { maxSteps: 10 },
    );

    expect(mockReader).toHaveBeenCalledWith(
      expect.objectContaining({
        stream: expect.anything(),
        abort: expect.any(Function),
        ...readerArgs,
      }),
    );
  });
  it('throws error when maxSteps is exceeded', async () => {
    const history: TestMessage[] = [];
    const action = new TestMessage('action');
    const observation = new TestMessage('observation');

    mockPrompter.mockReturnValue({ prompt: 'test prompt', readerArgs: {} });
    mockLanguageModel.sample.mockResolvedValue(makeTestStream(['response']));
    mockReader.mockResolvedValue(action);
    mockEvaluator.mockResolvedValue(observation);
    mockProgress = {
      history,
      isDone: vi.fn(() => false),
    };

    const attempt = doAttempt(
      prep,
      mockProgress,
      mockLanguageModel as unknown as LanguageModel<
        unknown,
        { response: string }
      >,
      { maxSteps: 3 },
    );

    await expect(attempt).rejects.toThrow('Invocation budget exceeded');
    expect(mockPrompter).toHaveBeenCalledTimes(3);
    expect(mockLanguageModel.sample).toHaveBeenCalledTimes(3);
    expect(mockReader).toHaveBeenCalledTimes(3);
    expect(mockEvaluator).toHaveBeenCalledTimes(3);
    expect(mockPrinter).toHaveBeenCalledTimes(3);
  });

  it('logs step numbers', async () => {
    const history: TestMessage[] = [];
    const action = new TestMessage('action');
    const observation = new TestMessage('observation');

    mockPrompter.mockReturnValue({ prompt: 'test prompt', readerArgs: {} });
    mockLanguageModel.sample.mockResolvedValue(makeTestStream(['response']));
    mockReader.mockResolvedValue(action);
    mockEvaluator.mockResolvedValue(observation);
    mockProgress = {
      history,
      isDone: vi.fn(() => true),
      result: 'result',
    };

    await doAttempt(
      prep,
      mockProgress,
      mockLanguageModel as unknown as LanguageModel<
        unknown,
        { response: string }
      >,
      { maxSteps: 5, logger },
    );

    expect(logger.info).toHaveBeenCalledWith('Step 1 of 5');
    expect(logger.info).toHaveBeenCalledWith('done:', 'result');
  });

  it('does not log when logger is not provided', async () => {
    const history: TestMessage[] = [];
    const action = new TestMessage('action');
    const observation = new TestMessage('observation');

    mockPrompter.mockReturnValue({ prompt: 'test prompt', readerArgs: {} });
    mockLanguageModel.sample.mockResolvedValue(makeTestStream(['response']));
    mockReader.mockResolvedValue(action);
    mockEvaluator.mockResolvedValue(observation);
    mockProgress = {
      history,
      isDone: vi.fn(() => true),
      result: 'result',
    };

    await doAttempt(
      prep,
      mockProgress,
      mockLanguageModel as unknown as LanguageModel<
        unknown,
        { response: string }
      >,
      { maxSteps: 5 },
    );

    expect(logger.info).not.toHaveBeenCalled();
  });

  it('handles null observation from evaluator', async () => {
    const history: TestMessage[] = [];
    const action = new TestMessage('action');

    mockPrompter.mockReturnValue({ prompt: 'test prompt', readerArgs: {} });
    mockLanguageModel.sample.mockResolvedValue(makeTestStream(['response']));
    mockReader.mockResolvedValue(action);
    mockEvaluator.mockResolvedValue(null);
    mockProgress = {
      history,
      isDone: vi
        .fn(() => false)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true),
      result: 'result',
    };

    await doAttempt(
      prep,
      mockProgress,
      mockLanguageModel as unknown as LanguageModel<
        unknown,
        { response: string }
      >,
      { maxSteps: 10 },
    );

    expect(mockPrinter).toHaveBeenCalledWith(action, null);
  });

  it('uses default maxSteps when not provided', async () => {
    const history: TestMessage[] = [];
    const action = new TestMessage('action');
    const observation = new TestMessage('observation');

    mockPrompter.mockReturnValue({ prompt: 'test prompt', readerArgs: {} });
    mockLanguageModel.sample.mockResolvedValue(makeTestStream(['response']));
    mockReader.mockResolvedValue(action);
    mockEvaluator.mockResolvedValue(observation);
    mockProgress = {
      history,
      isDone: vi.fn(() => true),
      result: 'result',
    };

    await doAttempt(
      prep,
      mockProgress,
      mockLanguageModel as unknown as LanguageModel<
        unknown,
        { response: string }
      >,
      {},
    );

    expect(mockPrompter).toHaveBeenCalledTimes(1);
  });
});
