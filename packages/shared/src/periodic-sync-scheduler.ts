export interface PeriodicSyncTask {
  readonly provider: string;
  sync(): Promise<unknown | null>;
}

export interface PeriodicSyncRunResult {
  readonly provider: string;
  readonly status: "synced" | "no_active_account" | "failed";
}

const redactSensitiveErrorDetail = (detail: string): string => detail.replace(
  /(\b(?:[a-z0-9_]*?(?:password|username|token|secret|api[_-]?key|cookie))\s*(?:=|:)\s*|--(?:password|username|token|secret|api[_-]?key|cookie)\s+)([^\s,;]+)/gi,
  "$1[REDACTED]"
);

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
      } catch (error) {
        results.push({ provider: task.provider, status: "failed" });
        const detail = error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error);
        console.error(`Periodic sync iteration failed: provider=${task.provider}; error=${redactSensitiveErrorDetail(detail)}`);
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
