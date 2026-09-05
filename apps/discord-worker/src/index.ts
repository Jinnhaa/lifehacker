import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import postgres from "postgres";
import {
  DayCloseService,
  DecisionLearningService,
  FocusWorkflowService,
  DynamicReplanningService,
  MorningWorkflowService,
  PrincipleApprovalService,
  SupabaseFocusRepository,
  SupabaseDayCloseRepository,
  SupabaseDecisionLearningRepository,
  SupabaseMorningRepository,
  SupabasePatternLearningRepository,
  SupabasePrincipleApprovalRepository,
  SupabaseReplanRepository,
  SupabaseTaskRepository,
  SupabaseWakeRepository,
  TaskService,
  WakeWorkflowService
} from "@amber/core";
import {
  InputService,
  OpenAIStructuredOutputProvider,
  ProviderAIInterpreter,
  SupabaseAIExecutionRecorder,
  SupabaseInputRepository
} from "@amber/input";
import { SystemClock } from "@amber/shared";
import { loadDiscordWorkerConfig } from "./config.js";
import { DiscordMessageAdapter } from "./discord-message-adapter.js";
import { SupabaseDiscordUserResolver } from "./discord-user-resolver.js";
import { WakeScheduler } from "./wake-scheduler.js";

const config = loadDiscordWorkerConfig();
const sql = postgres(config.databaseUrl, { max: 10 });
const clock = new SystemClock();
const taskRepository = new SupabaseTaskRepository(sql);
const inputRepository = new SupabaseInputRepository(sql);
const executionRecorder = new SupabaseAIExecutionRecorder(sql);
const interpreter = new ProviderAIInterpreter(
  OpenAIStructuredOutputProvider.fromEnvironment(process.env, { executionRecorder, clock })
);
const inputService = new InputService(inputRepository, interpreter, new TaskService(taskRepository, clock));
const morningRepository = new SupabaseMorningRepository(sql);
const principleApproval = new PrincipleApprovalService({
  repository: new SupabasePrincipleApprovalRepository(sql),
  clock
});
const decisionLearning = new DecisionLearningService({
  repository: new SupabaseDecisionLearningRepository(sql),
  clock,
  patternLearning: new SupabasePatternLearningRepository(sql)
});
const replanService = new DynamicReplanningService({
  repository: new SupabaseReplanRepository(sql),
  observationReader: morningRepository,
  clock,
  decisionLearning
});
const morningService = new MorningWorkflowService({ repository: morningRepository, clock, decisionLearning });
const focusService = new FocusWorkflowService({
  repository: new SupabaseFocusRepository(sql), clock, replanner: replanService, decisionLearning
});
const wakeRepository = new SupabaseWakeRepository(sql);
const wakeService = new WakeWorkflowService({ repository: wakeRepository, clock });
const dayCloseServiceWithWake = new DayCloseService({
  repository: new SupabaseDayCloseRepository(sql), clock, wakeFollowUp: wakeService, decisionLearning,
  principleFollowUp: principleApproval
});
const adapter = new DiscordMessageAdapter(
  config.allowedDiscordUserId,
  new SupabaseDiscordUserResolver(sql),
  inputService,
  taskRepository,
  morningService,
  focusService,
  replanService,
  dayCloseServiceWithWake,
  wakeService,
  principleApproval
);
const client = new Client({
  intents: [GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel],
  allowedMentions: { parse: [], repliedUser: false }
});
const wakeScheduler = new WakeScheduler(
  wakeRepository,
  { send: async (discordUserId, content) => { await (await client.users.fetch(discordUserId)).send(content); } },
  clock,
  config.wakePollIntervalMs
);

client.once(Events.ClientReady, () => {
  wakeScheduler.start();
  console.info("Discord worker ready");
});

client.on(Events.MessageCreate, (message) => {
  void adapter.handle({
    id: message.id,
    content: message.content,
    createdAt: message.createdAt,
    guildId: message.guildId,
    author: { id: message.author.id, bot: message.author.bot },
    reply: async (payload) => { await message.reply(payload); }
  }).catch(() => {
    console.error("Discord message handling failed");
  });
});

client.on(Events.ShardDisconnect, () => {
  console.warn("Discord gateway disconnected");
});

client.on(Events.Error, () => {
  console.error("Discord client error");
});

let shuttingDown = false;
const shutdown = async (): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  wakeScheduler.stop();
  client.destroy();
  await sql.end();
  console.info("Discord worker stopped");
};

process.once("SIGINT", () => { void shutdown(); });
process.once("SIGTERM", () => { void shutdown(); });

try {
  await client.login(config.botToken);
} catch {
  console.error("Discord worker failed to start");
  await shutdown();
  process.exitCode = 1;
}
