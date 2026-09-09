import postgres, { type Sql } from "postgres";
import type { AIExecutionRecord, AIExecutionRecorder } from "./openai-structured-output-provider.js";

export class SupabaseAIExecutionRecorder implements AIExecutionRecorder {
  constructor(private readonly sql: Sql) {}

  static connect(connectionString: string): SupabaseAIExecutionRecorder {
    return new SupabaseAIExecutionRecorder(postgres(connectionString, { max: 5 }));
  }

  async close(): Promise<void> {
    await this.sql.end();
  }

  async record(record: AIExecutionRecord): Promise<void> {
    await this.sql`
      insert into public.ai_executions(
        user_id,workflow_run_id,job_type,provider,model,prompt_version,input_context_hash,status,
        input_tokens,output_tokens,latency_ms,created_at,completed_at
      ) values (
        ${record.userId},${record.workflowRunId ?? null},${record.jobType},${record.provider},${record.model},${record.promptVersion},
        ${record.inputContextHash},${record.status},${record.inputTokens ?? null},${record.outputTokens ?? null},
        ${record.latencyMs},${record.createdAt},${record.completedAt}
      )
    `;
  }
}
