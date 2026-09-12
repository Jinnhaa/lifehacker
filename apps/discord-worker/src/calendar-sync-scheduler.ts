export type CalendarSyncProvider = "google_calendar" | "icloud_calendar";

export interface CalendarSyncTask {
  readonly provider: CalendarSyncProvider;
  sync(): Promise<unknown | null>;
}

export interface CalendarSyncRunResult {
  readonly provider: CalendarSyncProvider;
  readonly status: "synced" | "no_active_account" | "failed";
}

export class CalendarSyncScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly tasks: readonly CalendarSyncTask[],
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

  async runOnce(): Promise<readonly CalendarSyncRunResult[]> {
    const results: CalendarSyncRunResult[] = [];
    for (const task of this.tasks) {
      try {
        const result = await task.sync();
        results.push({ provider: task.provider, status: result === null ? "no_active_account" : "synced" });
      } catch {
        results.push({ provider: task.provider, status: "failed" });
        console.error(`Calendar sync iteration failed: provider=${task.provider}`);
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
