import type { Clock } from "@amber/shared";
import type { WakeDeliveryClaim, WakeRepository } from "@amber/core";

export interface WakeDiscordDelivery {
  send(discordUserId: string, content: string): Promise<void>;
}

const timeLabel = (value: Date, timeZone: string): string => new Intl.DateTimeFormat("ko-KR", {
  timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23"
}).format(value);

export const formatWakeMessage = (claim: WakeDeliveryClaim): string => [
  "좋은 아침. 일어날 시간이야.",
  ...(claim.firstConstraintAt ? [
    `오늘 첫 일정은 ${timeLabel(claim.firstConstraintAt, claim.timeZone)}${claim.firstConstraintTitle ? ` ${claim.firstConstraintTitle}` : ""}이야.`
  ] : []),
  "",
  "일어났으면 '일어남'이라고 해줘."
].join("\n");

export class WakeScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly repository: Pick<WakeRepository, "claimDue" | "completeDelivery" | "failDelivery">,
    private readonly delivery: WakeDiscordDelivery,
    private readonly clock: Clock,
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

  async runOnce(): Promise<number> {
    let delivered = 0;
    for (let index = 0; index < 25; index += 1) {
      const claim = await this.repository.claimDue(this.clock.now());
      if (!claim) break;
      try {
        await this.delivery.send(claim.discordUserId, formatWakeMessage(claim));
        await this.repository.completeDelivery(claim, this.clock.now());
        delivered += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Discord wake delivery failed";
        await this.repository.failDelivery(claim, message, this.clock.now());
      }
    }
    return delivered;
  }

  private async tickSafely(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.runOnce();
    } catch {
      console.error("Wake scheduler iteration failed");
    } finally {
      this.running = false;
    }
  }
}
