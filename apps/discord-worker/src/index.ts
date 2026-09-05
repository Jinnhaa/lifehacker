import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import postgres from "postgres";
import {
  DayCloseService,
  FocusWorkflowService,
  DynamicReplanningService,
  MorningWorkflowService,
  SupabaseFocusRepository,
  SupabaseDayCloseRepository,
  SupabaseMorningRepository,
  SupabaseReplanRepository,
  SupabaseTaskRepository,
  TaskService
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
const replanService = new DynamicReplanningService({
  repository: new SupabaseReplanRepository(sql),
  observationReader: morningRepository,
  clock
});
const morningService = new MorningWorkflowService({ repository: morningRepository, clock });
const focusService = new FocusWorkflowService({ repository: new SupabaseFocusRepository(sql), clock, replanner: replanService });
const dayCloseService = new DayCloseService({ repository: new SupabaseDayCloseRepository(sql), clock });
const adapter = new DiscordMessageAdapter(
  config.allowedDiscordUserId,
  new SupabaseDiscordUserResolver(sql),
  inputService,
  taskRepository,
  morningService,
  focusService,
  replanService,
  dayCloseService
);
const client = new Client({
  intents: [GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel],
  allowedMentions: { parse: [], repliedUser: false }
});

client.once(Events.ClientReady, () => {
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
