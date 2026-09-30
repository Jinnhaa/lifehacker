export interface PeriodicSyncTask {
  readonly provider: string;
  sync(): Promise<unknown | null>;
}

export interface PeriodicSyncRunResult {
  readonly provider: string;
  readonly status: "synced" | "no_active_account" | "failed";
}

export class PeriodicSyncScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly tasks: readonly PeriodicSyncTask[],
    private readonly intervalMs: number
  ) {}

  start(): void {
    if (this.timer) return;
    void this.tickSafely();
    this.timer = setInterval(() => { void this.tickSafely(); }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runOnce(): Promise<readonly PeriodicSyncRunResult[]> {
    const results: PeriodicSyncRunResult[] = [];
    for (const task of this.tasks) {
      try {
        const result = await task.sync();
        results.push({ provider: task.provider, status: result === null ? "no_active_account" : "synced" });
      } catch {
        results.push({ provider: task.provider, status: "failed" });
        console.error(`Periodic sync iteration failed: provider=${task.provider}`);
      }
    }
    return results;
  }

  private async tickSafely(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.runOnce();
    } finally {
      this.running = false;
    }
  }
}
