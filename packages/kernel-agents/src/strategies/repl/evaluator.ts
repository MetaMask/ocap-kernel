import { SampleGenerationError, EvaluatorError } from '@metamask/kernel-errors';
import { mergeDisjointRecords } from '@metamask/kernel-utils';
import type { Logger } from '@metamask/logger';

import { makeCompartment } from './compartment.ts';
import {
  CommentMessage,
  EvaluationMessage,
  ImportMessage,
  ResultMessage,
} from './messages.ts';
import type { ReplTranscript, StatementMessage } from './messages.ts';
import { prepareEvaluation } from './prepare-evaluation.ts';
import { ERROR, RETURN } from './symbols.ts';
import type { EvaluatorState } from './types.ts';
import { extractCapabilities } from '../../capabilities/capability.ts';
import type { CapabilityRecord } from '../../types.ts';
import { ifDefined } from '../../utils.ts';

/**
 * Error classification result for compartment errors.
 */
type ErrorClassification =
  | { type: 'sample-generation'; error: SampleGenerationError }
  | { type: 'internal'; error: EvaluatorError }
  | { type: 'valid-feedback'; error: Error };

/**
 * Classifies a compartment error into one of three categories:
 * 1. Sample generation errors (syntax/reference errors) - should trigger retry
 * 2. Internal errors (REPL infrastructure violations) - should exit attempt
 * 3. Valid feedback errors (capability errors, etc.) - should be surfaced to agent
 *
 * @param error - The error to classify.
 * @param code - The code that was being evaluated.
 * @returns The classification result.
 */
const classifyCompartmentError = (
  error: unknown,
  code: string,
): ErrorClassification => {
  const cause = error instanceof Error ? error : new Error(String(error));

  // Check if this is already an EvaluatorError (thrown by safe wrappers)
  if (cause instanceof EvaluatorError) {
    return {
      type: 'internal',
      error: cause,
    };
  }

  // Check if this is a sample generation error (syntax/reference errors)
  if (
    cause instanceof SyntaxError ||
    cause instanceof ReferenceError ||
    cause.name === 'SyntaxError' ||
    cause.name === 'ReferenceError'
  ) {
    return {
      type: 'sample-generation',
      error: new SampleGenerationError(code, cause),
    };
  }

  // All other errors are valid feedback (capability errors, NotImplemented, etc.)
  return {
    type: 'valid-feedback',
    error: cause,
  };
};

const validateStatement = (
  statement: StatementMessage,
): { earlyResult?: ResultMessage | null } => {
  if (statement instanceof CommentMessage) {
    // Comments are not evaluated.
    return { earlyResult: null };
  }
  if (statement instanceof ImportMessage) {
    // Imports are not implemented yet.
    return {
      earlyResult: new ResultMessage({
        [ERROR]: new SyntaxError('Additional imports are not allowed.'),
      }),
    };
  }
  if (!(statement instanceof EvaluationMessage)) {
    // This should never happen.
    throw new Error(
      [
        'Internal: Unknown statement',
        `statement: ${statement.messageBody.node.text}`,
        `type: ${statement.messageBody.node.toString()}`,
      ].join('\n'),
    );
  }
  // Otherwise, proceed with the evaluation.
  return {};
};

export const makeEvaluator = ({
  capabilities = {},
  logger,
  // For testing purposes.
  initState = () => ({ consts: {}, lets: {} }),
}: {
  capabilities?: CapabilityRecord;
  logger?: Logger;
  initState?: () => EvaluatorState;
}) => {
  const state: EvaluatorState = initState();

  return async (
    history: ReplTranscript,
    statement: StatementMessage,
  ): Promise<ResultMessage | null> => {
    // Validate the statement.
    const validation = validateStatement(statement);
    if ('earlyResult' in validation) {
      const { earlyResult } = validation;
      history.push(statement, ...(earlyResult ? [earlyResult] : []));
      return earlyResult;
    }

    // Prepare the evaluation.
    const { code, endowments, result, commit } = prepareEvaluation(
      state,
      statement.messageBody.node,
      ifDefined({ logger }),
    );

    logger?.info('capabilities:', capabilities);
    logger?.info('endowments:', endowments);
    logger?.info('evaluating:', code);

    // Prepare the compartment.
    const compartmentEndowments = mergeDisjointRecords(
      endowments,
      extractCapabilities(capabilities),
    );
    const compartment = makeCompartment(compartmentEndowments);

    // Handle errors that escape the wrapped code (infrastructure/setup errors)
    // If an error evades $catch, it must be an EvaluatorError because:
    // - Errors in destructuring/await null are infrastructure code
    // - Errors from $catch/$capture are wrapped with makeSafe (EvaluatorError)
    // - User code errors are caught by $catch
    try {
      await compartment.evaluate(code);
    } catch (cause) {
      const asError = (error: unknown): Error =>
        error instanceof Error ? error : new Error(String(error));
      // Errors that evade $catch are always infrastructure errors
      throw new EvaluatorError(
        'REPL evaluation failed',
        code,
        // If the error is already an EvaluatorError, we rethrow with the code,
        cause instanceof EvaluatorError
          ? (cause.cause as Error)
          : // Otherwise, wrap the error as EvaluatorError
            asError(cause),
      );
    }

    // Handle errors caught by $catch (user code errors)
    if (Object.hasOwn(result, ERROR)) {
      const classification = classifyCompartmentError(result[ERROR], code);
      if (['sample-generation', 'internal'].includes(classification.type)) {
        throw classification.error;
      }
      // Valid feedback error: treat as result, stripping out the stack trace
      const withoutStack = (error: unknown): unknown =>
        error instanceof Error
          ? new Error(
              error.message,
              ...(error.cause ? [{ cause: withoutStack(error.cause) }] : []),
            )
          : error;
      result[ERROR] = withoutStack(result[ERROR]);
    }

    // Update the state and return the result
    const stepResult = [ERROR, RETURN, 'value'].some((key) =>
      Object.hasOwn(result, key),
    )
      ? new ResultMessage(result)
      : null;
    history.push(statement, ...(stepResult ? [stepResult] : []));
    commit();

    return stepResult;
  };
};
