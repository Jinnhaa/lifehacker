export interface WorkDiscoverySyncTask { sync(): Promise<unknown | null> }
export type WorkDiscoveryRunStatus = "synced" | "no_active_account" | "failed";

export class WorkDiscoveryScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  constructor(private readonly task: WorkDiscoverySyncTask, private readonly intervalMs: number) {}
  start(): void {
    if (this.timer) return;
    void this.tickSafely();
    this.timer = setInterval(() => { void this.tickSafely(); }, this.intervalMs);
  }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }
  async runOnce(): Promise<WorkDiscoveryRunStatus> {
    try { return await this.task.sync() === null ? "no_active_account" : "synced"; }
    catch { console.error("Work discovery sync iteration failed: provider=notion"); return "failed"; }
  }
  private async tickSafely(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try { await this.runOnce(); } finally { this.running = false; }
  }
}
