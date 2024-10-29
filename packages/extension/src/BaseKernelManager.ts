import type { Kernel, VatId } from '@ocap/kernel';

export class BaseKernelManager {
  protected kernel: Kernel | undefined;

  async initKernel(): Promise<void> {
    if (this.kernel) {
      throw new Error('Kernel already initialized');
    }
    // Implementation will be provided by platform-specific managers
  }

  async shutdownKernel(): Promise<void> {
    if (!this.kernel) {
      throw new Error('Kernel not initialized');
    }
    await this.terminateAllVats();
    this.kernel = undefined;
  }

  async getKernelStatus(): Promise<{
    isRunning: boolean;
    activeVats: VatId[];
  }> {
    return {
      isRunning: Boolean(this.kernel),
      activeVats: this.kernel?.getVatIds() ?? [],
    };
  }

  async launchVat(id: VatId): Promise<void> {
    if (!this.kernel) {
      throw new Error('Kernel not initialized');
    }
    await this.kernel.launchVat({ id });
  }

  async restartVat(id: VatId): Promise<void> {
    if (!this.kernel) {
      throw new Error('Kernel not initialized');
    }
    await this.terminateVat(id);
    await this.launchVat(id);
  }

  async terminateVat(id: VatId): Promise<void> {
    if (!this.kernel) {
      throw new Error('Kernel not initialized');
    }
    await this.kernel.deleteVat(id);
  }

  async terminateAllVats(): Promise<void> {
    if (!this.kernel) {
      throw new Error('Kernel not initialized');
    }
    await Promise.all(
      this.kernel.getVatIds().map(async (id) => this.terminateVat(id)),
    );
  }
}
