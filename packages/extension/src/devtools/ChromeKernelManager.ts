import { BaseKernelManager } from '../BaseKernelManager.js';

export class ChromeKernelManager extends BaseKernelManager {
  async initKernel(): Promise<void> {
    await super.initKernel();

    // TODO: Initialize kernel with Chrome-specific setup
  }
}
