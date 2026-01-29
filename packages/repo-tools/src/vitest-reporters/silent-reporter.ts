/**
 * Silent Vitest reporter based on the DotReporter implementation.
 * Outputs nothing during test execution and only displays errors at the end
 * if there are failures. Outputs nothing if all tests pass.
 *
 * @see https://github.com/vitest-dev/vitest/blob/20e00ef7808de6d330c5e2fda530f686e08f1c8d/packages/vitest/src/node/reporters/dot.ts
 */
import type { File as VitestFile } from '@vitest/runner';
import type {
  SerializedError,
  TestModule,
  TestRunEndReason,
} from 'vitest/node';
import { DotReporter } from 'vitest/reporters';
import type { BaseReporter } from 'vitest/reporters';

/**
 * A silent Vitest reporter that outputs nothing during test execution and
 * only displays errors at the end if there are failures. Outputs nothing if
 * all tests pass.
 */
export class SilentReporter extends DotReporter {
  /**
   * Initializes the reporter without printing the banner.
   *
   * @param ctx - The Vitest context.
   */
  onInit(ctx: (typeof this)['ctx']): void {
    // Set up context without calling super.onInit which prints the banner
    this.ctx = ctx;
  }

  /**
   * Suppresses dot output during test case completion.
   */
  onTestCaseResult(): void {
    // Silent - no dots during execution
  }

  /**
   * Suppresses module end output.
   */
  onTestModuleEnd(): void {
    // Silent - no output during execution
  }

  /**
   * Suppresses the final dot line that DotReporter prints.
   *
   * @param testModules - The test modules that were run.
   * @param unhandledErrors - Any unhandled errors that occurred.
   * @param reason - The reason the test run ended.
   */
  onTestRunEnd(
    testModules: readonly TestModule[],
    unhandledErrors: readonly SerializedError[],
    reason: TestRunEndReason,
  ): void {
    // Skip DotReporter's onTestRunEnd which prints dots,
    // call grandparent's onTestRunEnd directly via prototype.
    // Chain: this -> SilentReporter.prototype -> DotReporter.prototype -> BaseReporter.prototype
    const baseReporterProto = Object.getPrototypeOf(
      Object.getPrototypeOf(Object.getPrototypeOf(this)),
    ) as BaseReporter;
    baseReporterProto.onTestRunEnd.call(
      this,
      testModules,
      unhandledErrors,
      reason,
    );
  }

  /**
   * Reports summary only when there are failures.
   *
   * @param files - The test files that were run.
   * @param errors - Any errors that occurred during the run.
   */
  reportSummary(files: VitestFile[], errors: unknown[]): void {
    const hasFailed = files.some(
      (file) =>
        file.result?.state === 'fail' ||
        file.tasks.some((task) => task.result?.state === 'fail'),
    );

    if (hasFailed || errors.length > 0) {
      super.reportSummary(files, errors);
    }
    // Silent when all pass
  }
}

export default SilentReporter;
