export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity_occurrences: {
        Row: {
          actual_minutes: number | null
          counts_toward_target: boolean
          created_at: string
          ended_at: string | null
          id: string
          period_key: string
          planned_date: string | null
          planned_start_at: string | null
          recurring_activity_id: string
          sequence_no: number
          started_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          actual_minutes?: number | null
          counts_toward_target?: boolean
          created_at?: string
          ended_at?: string | null
          id?: string
          period_key: string
          planned_date?: string | null
          planned_start_at?: string | null
          recurring_activity_id: string
          sequence_no: number
          started_at?: string | null
          status: string
          user_id: string
        }
        Update: {
          actual_minutes?: number | null
          counts_toward_target?: boolean
          created_at?: string
          ended_at?: string | null
          id?: string
          period_key?: string
          planned_date?: string | null
          planned_start_at?: string | null
          recurring_activity_id?: string
          sequence_no?: number
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_occurrences_recurring_activity_id_user_id_fkey"
            columns: ["recurring_activity_id", "user_id"]
            isOneToOne: false
            referencedRelation: "recurring_activities"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "activity_occurrences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_instances: {
        Row: {
          agent_template_id: string
          archived_at: string | null
          created_at: string
          custom_instructions: string | null
          home_scope_id: string
          id: string
          name: string
          status: string
          template_version: string
          user_id: string
        }
        Insert: {
          agent_template_id: string
          archived_at?: string | null
          created_at?: string
          custom_instructions?: string | null
          home_scope_id: string
          id?: string
          name: string
          status: string
          template_version: string
          user_id: string
        }
        Update: {
          agent_template_id?: string
          archived_at?: string | null
          created_at?: string
          custom_instructions?: string | null
          home_scope_id?: string
          id?: string
          name?: string
          status?: string
          template_version?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_instances_agent_template_id_user_id_fkey"
            columns: ["agent_template_id", "user_id"]
            isOneToOne: false
            referencedRelation: "agent_templates"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "agent_instances_home_scope_id_user_id_fkey"
            columns: ["home_scope_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scopes"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "agent_instances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          agent_instance_id: string
          context_package_id: string | null
          cost_budget_krw: number | null
          created_at: string
          ended_at: string | null
          id: string
          max_tool_calls: number
          max_turns: number
          policy_version: string
          started_at: string
          status: string
          template_version: string
          user_id: string
          workflow_run_id: string | null
        }
        Insert: {
          agent_instance_id: string
          context_package_id?: string | null
          cost_budget_krw?: number | null
          created_at?: string
          ended_at?: string | null
          id?: string
          max_tool_calls: number
          max_turns: number
          policy_version: string
          started_at: string
          status: string
          template_version: string
          user_id: string
          workflow_run_id?: string | null
        }
        Update: {
          agent_instance_id?: string
          context_package_id?: string | null
          cost_budget_krw?: number | null
          created_at?: string
          ended_at?: string | null
          id?: string
          max_tool_calls?: number
          max_turns?: number
          policy_version?: string
          started_at?: string
          status?: string
          template_version?: string
          user_id?: string
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_agent_instance_id_user_id_fkey"
            columns: ["agent_instance_id", "user_id"]
            isOneToOne: false
            referencedRelation: "agent_instances"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "agent_runs_context_package_id_user_id_fkey"
            columns: ["context_package_id", "user_id"]
            isOneToOne: false
            referencedRelation: "context_packages"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "agent_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_workflow_run_id_user_id_fkey"
            columns: ["workflow_run_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      agent_scope_grants: {
        Row: {
          access_level: string
          agent_instance_id: string
          id: string
          scope_id: string
          user_id: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          access_level: string
          agent_instance_id: string
          id?: string
          scope_id: string
          user_id: string
          valid_from: string
          valid_until?: string | null
        }
        Update: {
          access_level?: string
          agent_instance_id?: string
          id?: string
          scope_id?: string
          user_id?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_scope_grants_agent_instance_id_user_id_fkey"
            columns: ["agent_instance_id", "user_id"]
            isOneToOne: false
            referencedRelation: "agent_instances"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "agent_scope_grants_scope_id_user_id_fkey"
            columns: ["scope_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scopes"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "agent_scope_grants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_templates: {
        Row: {
          active: boolean
          created_at: string
          id: string
          instructions: string
          name: string
          role: string
          template_key: string
          user_id: string
          version: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          instructions: string
          name: string
          role: string
          template_key: string
          user_id: string
          version: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          instructions?: string
          name?: string
          role?: string
          template_key?: string
          user_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_templates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_executions: {
        Row: {
          agent_run_id: string | null
          completed_at: string | null
          created_at: string
          estimated_cost_krw: number | null
          estimated_cost_usd: number | null
          fx_rate_snapshot: number | null
          id: string
          input_context_hash: string
          input_tokens: number | null
          job_type: string
          latency_ms: number | null
          model: string
          output_tokens: number | null
          prompt_version: string | null
          provider: string
          status: string
          user_id: string
          workflow_run_id: string | null
        }
        Insert: {
          agent_run_id?: string | null
          completed_at?: string | null
          created_at?: string
          estimated_cost_krw?: number | null
          estimated_cost_usd?: number | null
          fx_rate_snapshot?: number | null
          id?: string
          input_context_hash: string
          input_tokens?: number | null
          job_type: string
          latency_ms?: number | null
          model: string
          output_tokens?: number | null
          prompt_version?: string | null
          provider: string
          status: string
          user_id: string
          workflow_run_id?: string | null
        }
        Update: {
          agent_run_id?: string | null
          completed_at?: string | null
          created_at?: string
          estimated_cost_krw?: number | null
          estimated_cost_usd?: number | null
          fx_rate_snapshot?: number | null
          id?: string
          input_context_hash?: string
          input_tokens?: number | null
          job_type?: string
          latency_ms?: number | null
          model?: string
          output_tokens?: number | null
          prompt_version?: string | null
          provider?: string
          status?: string
          user_id?: string
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_executions_agent_run_id_user_id_fkey"
            columns: ["agent_run_id", "user_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "ai_executions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_executions_workflow_run_id_user_id_fkey"
            columns: ["workflow_run_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      approval_requests: {
        Row: {
          action_hash: string
          action_ref: string
          action_type: string
          checkpoint_version: number
          created_at: string
          decision_id: string | null
          expires_at: string | null
          id: string
          requested_at: string
          responded_at: string | null
          responded_by: string | null
          response_payload: Json | null
          resume_idempotency_key: string
          status: string
          user_id: string
          workflow_run_id: string
        }
        Insert: {
          action_hash: string
          action_ref: string
          action_type: string
          checkpoint_version: number
          created_at?: string
          decision_id?: string | null
          expires_at?: string | null
          id?: string
          requested_at: string
          responded_at?: string | null
          responded_by?: string | null
          response_payload?: Json | null
          resume_idempotency_key: string
          status: string
          user_id: string
          workflow_run_id: string
        }
        Update: {
          action_hash?: string
          action_ref?: string
          action_type?: string
          checkpoint_version?: number
          created_at?: string
          decision_id?: string | null
          expires_at?: string | null
          id?: string
          requested_at?: string
          responded_at?: string | null
          responded_by?: string | null
          response_payload?: Json | null
          resume_idempotency_key?: string
          status?: string
          user_id?: string
          workflow_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_decision_id_user_id_fkey"
            columns: ["decision_id", "user_id"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "approval_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_workflow_run_id_user_id_fkey"
            columns: ["workflow_run_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      artifacts: {
        Row: {
          artifact_type: string
          content_hash: string | null
          content_text: string | null
          created_at: string
          id: string
          source_agent_run_id: string | null
          source_ai_execution_id: string | null
          storage_path: string | null
          task_id: string | null
          title: string | null
          user_id: string
          work_context_id: string | null
        }
        Insert: {
          artifact_type: string
          content_hash?: string | null
          content_text?: string | null
          created_at?: string
          id?: string
          source_agent_run_id?: string | null
          source_ai_execution_id?: string | null
          storage_path?: string | null
          task_id?: string | null
          title?: string | null
          user_id: string
          work_context_id?: string | null
        }
        Update: {
          artifact_type?: string
          content_hash?: string | null
          content_text?: string | null
          created_at?: string
          id?: string
          source_agent_run_id?: string | null
          source_ai_execution_id?: string | null
          storage_path?: string | null
          task_id?: string | null
          title?: string | null
          user_id?: string
          work_context_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "artifacts_source_agent_run_id_user_id_fkey"
            columns: ["source_agent_run_id", "user_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "artifacts_source_ai_execution_id_user_id_fkey"
            columns: ["source_ai_execution_id", "user_id"]
            isOneToOne: false
            referencedRelation: "ai_executions"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "artifacts_task_id_user_id_fkey"
            columns: ["task_id", "user_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "artifacts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifacts_work_context_id_user_id_fkey"
            columns: ["work_context_id", "user_id"]
            isOneToOne: false
            referencedRelation: "work_contexts"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      constraints: {
        Row: {
          constraint_type: string
          created_at: string
          hardness: string
          id: string
          origin: string
          reason: string | null
          user_id: string
          valid_from: string
          valid_until: string | null
          value: Json
        }
        Insert: {
          constraint_type: string
          created_at?: string
          hardness: string
          id?: string
          origin: string
          reason?: string | null
          user_id: string
          valid_from: string
          valid_until?: string | null
          value: Json
        }
        Update: {
          constraint_type?: string
          created_at?: string
          hardness?: string
          id?: string
          origin?: string
          reason?: string | null
          user_id?: string
          valid_from?: string
          valid_until?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "constraints_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      context_packages: {
        Row: {
          created_at: string
          id: string
          payload: Json
          policy_version: string
          retention_expires_at: string | null
          scope_id: string
          source_refs: Json
          task_id: string | null
          user_id: string
          work_context_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          payload: Json
          policy_version: string
          retention_expires_at?: string | null
          scope_id: string
          source_refs: Json
          task_id?: string | null
          user_id: string
          work_context_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          policy_version?: string
          retention_expires_at?: string | null
          scope_id?: string
          source_refs?: Json
          task_id?: string | null
          user_id?: string
          work_context_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "context_packages_scope_id_user_id_fkey"
            columns: ["scope_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scopes"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "context_packages_task_id_user_id_fkey"
            columns: ["task_id", "user_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "context_packages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "context_packages_work_context_id_user_id_fkey"
            columns: ["work_context_id", "user_id"]
            isOneToOne: false
            referencedRelation: "work_contexts"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      course_assessments: {
        Row: {
          assessment_type: string
          course_context_id: string
          created_at: string
          due_at: string | null
          id: string
          linked_task_id: string | null
          max_score: number | null
          observed_at: string
          provenance: string
          score: number | null
          submission_status: string | null
          title: string
          updated_at: string
          user_id: string
          weight_percent: number | null
        }
        Insert: {
          assessment_type: string
          course_context_id: string
          created_at?: string
          due_at?: string | null
          id?: string
          linked_task_id?: string | null
          max_score?: number | null
          observed_at: string
          provenance: string
          score?: number | null
          submission_status?: string | null
          title: string
          updated_at?: string
          user_id: string
          weight_percent?: number | null
        }
        Update: {
          assessment_type?: string
          course_context_id?: string
          created_at?: string
          due_at?: string | null
          id?: string
          linked_task_id?: string | null
          max_score?: number | null
          observed_at?: string
          provenance?: string
          score?: number | null
          submission_status?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          weight_percent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "course_assessments_course_context_id_user_id_fkey"
            columns: ["course_context_id", "user_id"]
            isOneToOne: false
            referencedRelation: "work_contexts"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "course_assessments_linked_task_id_user_id_fkey"
            columns: ["linked_task_id", "user_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "course_assessments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      course_profiles: {
        Row: {
          created_at: string
          instructor: string | null
          self_reported_understanding: number | null
          target_grade: string | null
          term: string | null
          updated_at: string
          user_id: string
          work_context_id: string
        }
        Insert: {
          created_at?: string
          instructor?: string | null
          self_reported_understanding?: number | null
          target_grade?: string | null
          term?: string | null
          updated_at?: string
          user_id: string
          work_context_id: string
        }
        Update: {
          created_at?: string
          instructor?: string | null
          self_reported_understanding?: number | null
          target_grade?: string | null
          term?: string | null
          updated_at?: string
          user_id?: string
          work_context_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_profiles_work_context_id_user_id_fkey"
            columns: ["work_context_id", "user_id"]
            isOneToOne: true
            referencedRelation: "work_contexts"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      daily_plans: {
        Row: {
          approval_reason: string | null
          approval_source: string | null
          approved_at: string | null
          closed_at: string | null
          created_at: string
          created_by: string
          id: string
          input_snapshot: Json
          plan_date: string
          revision_no: number
          status: string
          supersedes_plan_id: string | null
          timezone: string
          user_id: string
        }
        Insert: {
          approval_reason?: string | null
          approval_source?: string | null
          approved_at?: string | null
          closed_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          input_snapshot?: Json
          plan_date: string
          revision_no: number
          status: string
          supersedes_plan_id?: string | null
          timezone: string
          user_id: string
        }
        Update: {
          approval_reason?: string | null
          approval_source?: string | null
          approved_at?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          input_snapshot?: Json
          plan_date?: string
          revision_no?: number
          status?: string
          supersedes_plan_id?: string | null
          timezone?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_plans_supersedes_plan_id_user_id_fkey"
            columns: ["supersedes_plan_id", "user_id"]
            isOneToOne: false
            referencedRelation: "daily_plans"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "daily_plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_feedback: {
        Row: {
          corrected_ai_assumption: string | null
          created_at: string
          decision_id: string
          id: string
          user_choice: Json
          user_id: string
          user_reason: string | null
        }
        Insert: {
          corrected_ai_assumption?: string | null
          created_at?: string
          decision_id: string
          id?: string
          user_choice: Json
          user_id: string
          user_reason?: string | null
        }
        Update: {
          corrected_ai_assumption?: string | null
          created_at?: string
          decision_id?: string
          id?: string
          user_choice?: Json
          user_id?: string
          user_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "decision_feedback_decision_id_user_id_fkey"
            columns: ["decision_id", "user_id"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "decision_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      decisions: {
        Row: {
          ai_reason: string | null
          ai_recommendation: Json | null
          created_at: string
          id: string
          impact: Json | null
          options: Json
          question: string
          resolved_at: string | null
          status: string
          user_id: string
          why_now: string | null
          workflow_run_id: string | null
        }
        Insert: {
          ai_reason?: string | null
          ai_recommendation?: Json | null
          created_at?: string
          id?: string
          impact?: Json | null
          options: Json
          question: string
          resolved_at?: string | null
          status: string
          user_id: string
          why_now?: string | null
          workflow_run_id?: string | null
        }
        Update: {
          ai_reason?: string | null
          ai_recommendation?: Json | null
          created_at?: string
          id?: string
          impact?: Json | null
          options?: Json
          question?: string
          resolved_at?: string | null
          status?: string
          user_id?: string
          why_now?: string | null
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "decisions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_workflow_user_fk"
            columns: ["workflow_run_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      domain_commands: {
        Row: {
          applied_at: string | null
          causation_id: string | null
          command_type: string
          correlation_id: string
          created_at: string
          id: string
          idempotency_key: string
          payload: Json
          result_entity_id: string | null
          result_entity_type: string | null
          status: string
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          causation_id?: string | null
          command_type: string
          correlation_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          payload: Json
          result_entity_id?: string | null
          result_entity_type?: string | null
          status: string
          user_id: string
        }
        Update: {
          applied_at?: string | null
          causation_id?: string | null
          command_type?: string
          correlation_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          payload?: Json
          result_entity_id?: string | null
          result_entity_type?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "domain_commands_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_events: {
        Row: {
          actor_id: string | null
          actor_type: string
          aggregate_id: string
          aggregate_type: string
          causation_id: string | null
          correlation_id: string
          event_type: string
          id: string
          idempotency_key: string | null
          occurred_at: string
          payload: Json
          payload_version: number
          recorded_at: string
          user_id: string
          workflow_run_id: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_type: string
          aggregate_id: string
          aggregate_type: string
          causation_id?: string | null
          correlation_id: string
          event_type: string
          id?: string
          idempotency_key?: string | null
          occurred_at: string
          payload?: Json
          payload_version: number
          recorded_at?: string
          user_id: string
          workflow_run_id?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          aggregate_id?: string
          aggregate_type?: string
          causation_id?: string | null
          correlation_id?: string
          event_type?: string
          id?: string
          idempotency_key?: string | null
          occurred_at?: string
          payload?: Json
          payload_version?: number
          recorded_at?: string
          user_id?: string
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "domain_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domain_events_workflow_user_fk"
            columns: ["workflow_run_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      estimate_revisions: {
        Row: {
          created_at: string
          estimate_type: string
          id: string
          minutes: number
          origin: string
          reason: string | null
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          estimate_type: string
          id?: string
          minutes: number
          origin: string
          reason?: string | null
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          estimate_type?: string
          id?: string
          minutes?: number
          origin?: string
          reason?: string | null
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimate_revisions_task_id_user_id_fkey"
            columns: ["task_id", "user_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "estimate_revisions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      external_references: {
        Row: {
          content_hash: string | null
          deleted_at: string | null
          external_id: string
          external_type: string
          external_version: string | null
          first_seen_at: string
          id: string
          internal_entity_id: string
          internal_entity_type: string
          last_seen_at: string
          ownership: string
          source: string
          sync_status: string
          user_id: string
        }
        Insert: {
          content_hash?: string | null
          deleted_at?: string | null
          external_id: string
          external_type: string
          external_version?: string | null
          first_seen_at: string
          id?: string
          internal_entity_id: string
          internal_entity_type: string
          last_seen_at: string
          ownership: string
          source: string
          sync_status: string
          user_id: string
        }
        Update: {
          content_hash?: string | null
          deleted_at?: string | null
          external_id?: string
          external_type?: string
          external_version?: string | null
          first_seen_at?: string
          id?: string
          internal_entity_id?: string
          internal_entity_type?: string
          last_seen_at?: string
          ownership?: string
          source?: string
          sync_status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_references_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      focus_sessions: {
        Row: {
          actual_minutes: number
          created_at: string
          current_step_id: string | null
          end_reason: string | null
          ended_at: string | null
          id: string
          paused_at: string | null
          plan_item_id: string | null
          started_at: string
          status: string
          task_id: string
          user_id: string
        }
        Insert: {
          actual_minutes?: number
          created_at?: string
          current_step_id?: string | null
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          paused_at?: string | null
          plan_item_id?: string | null
          started_at: string
          status: string
          task_id: string
          user_id: string
        }
        Update: {
          actual_minutes?: number
          created_at?: string
          current_step_id?: string | null
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          paused_at?: string | null
          plan_item_id?: string | null
          started_at?: string
          status?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "focus_sessions_current_step_id_user_id_fkey"
            columns: ["current_step_id", "user_id"]
            isOneToOne: false
            referencedRelation: "task_steps"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "focus_sessions_plan_item_id_user_id_fkey"
            columns: ["plan_item_id", "user_id"]
            isOneToOne: false
            referencedRelation: "plan_items"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "focus_sessions_task_id_user_id_fkey"
            columns: ["task_id", "user_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "focus_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          archived_at: string | null
          created_at: string
          description: string | null
          id: string
          importance: number
          origin: string
          scope_id: string | null
          status: string
          title: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          importance: number
          origin: string
          scope_id?: string | null
          status: string
          title: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          importance?: number
          origin?: string
          scope_id?: string | null
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_scope_id_user_id_fkey"
            columns: ["scope_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scopes"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_items: {
        Row: {
          content_hash: string | null
          correlation_id: string
          created_at: string
          dedupe_key: string
          external_id: string | null
          external_version: string | null
          id: string
          observed_at: string | null
          parse_status: string
          provenance: string
          raw_content: string | null
          raw_payload: Json | null
          received_at: string
          source: string
          user_id: string
        }
        Insert: {
          content_hash?: string | null
          correlation_id: string
          created_at?: string
          dedupe_key: string
          external_id?: string | null
          external_version?: string | null
          id?: string
          observed_at?: string | null
          parse_status: string
          provenance: string
          raw_content?: string | null
          raw_payload?: Json | null
          received_at: string
          source: string
          user_id: string
        }
        Update: {
          content_hash?: string | null
          correlation_id?: string
          created_at?: string
          dedupe_key?: string
          external_id?: string | null
          external_version?: string | null
          id?: string
          observed_at?: string | null
          parse_status?: string
          provenance?: string
          raw_content?: string | null
          raw_payload?: Json | null
          received_at?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_accounts: {
        Row: {
          connected_at: string | null
          created_at: string
          external_account_id: string | null
          id: string
          last_sync_at: string | null
          metadata: Json
          provider: string
          secret_ref: string | null
          status: string
          user_id: string
        }
        Insert: {
          connected_at?: string | null
          created_at?: string
          external_account_id?: string | null
          id?: string
          last_sync_at?: string | null
          metadata?: Json
          provider: string
          secret_ref?: string | null
          status: string
          user_id: string
        }
        Update: {
          connected_at?: string | null
          created_at?: string
          external_account_id?: string | null
          id?: string
          last_sync_at?: string | null
          metadata?: Json
          provider?: string
          secret_ref?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_case_events: {
        Row: {
          domain_event_id: string
          event_role: string
          learning_case_id: string
        }
        Insert: {
          domain_event_id: string
          event_role: string
          learning_case_id: string
        }
        Update: {
          domain_event_id?: string
          event_role?: string
          learning_case_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_case_events_domain_event_id_fkey"
            columns: ["domain_event_id"]
            isOneToOne: false
            referencedRelation: "domain_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_case_events_learning_case_id_fkey"
            columns: ["learning_case_id"]
            isOneToOne: false
            referencedRelation: "learning_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_cases: {
        Row: {
          case_type: string
          closed_at: string | null
          context_snapshot: Json
          created_at: string
          decision_feedback_id: string | null
          decision_id: string | null
          id: string
          recommendation_snapshot: Json | null
          status: string
          user_id: string
        }
        Insert: {
          case_type: string
          closed_at?: string | null
          context_snapshot: Json
          created_at?: string
          decision_feedback_id?: string | null
          decision_id?: string | null
          id?: string
          recommendation_snapshot?: Json | null
          status: string
          user_id: string
        }
        Update: {
          case_type?: string
          closed_at?: string | null
          context_snapshot?: Json
          created_at?: string
          decision_feedback_id?: string | null
          decision_id?: string | null
          id?: string
          recommendation_snapshot?: Json | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_cases_decision_feedback_id_user_id_fkey"
            columns: ["decision_feedback_id", "user_id"]
            isOneToOne: false
            referencedRelation: "decision_feedback"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "learning_cases_decision_id_user_id_fkey"
            columns: ["decision_id", "user_id"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "learning_cases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_server_connections: {
        Row: {
          auth_secret_ref: string | null
          capabilities: Json
          created_at: string
          enabled: boolean
          id: string
          protocol_version: string | null
          server_label: string
          server_url: string | null
          transport: string
          trust_level: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth_secret_ref?: string | null
          capabilities?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          protocol_version?: string | null
          server_label: string
          server_url?: string | null
          transport: string
          trust_level: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth_secret_ref?: string | null
          capabilities?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          protocol_version?: string | null
          server_label?: string
          server_url?: string | null
          transport?: string
          trust_level?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_server_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      memories: {
        Row: {
          archived_at: string | null
          confirmation_status: string
          content: string
          created_at: string
          id: string
          importance: number
          memory_type: string
          origin: string
          retention_class: string
          scope_id: string | null
          source_event_id: string | null
          source_reference: Json | null
          summary: string | null
          title: string | null
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          confirmation_status: string
          content: string
          created_at?: string
          id?: string
          importance: number
          memory_type: string
          origin: string
          retention_class: string
          scope_id?: string | null
          source_event_id?: string | null
          source_reference?: Json | null
          summary?: string | null
          title?: string | null
          user_id: string
        }
        Update: {
          archived_at?: string | null
          confirmation_status?: string
          content?: string
          created_at?: string
          id?: string
          importance?: number
          memory_type?: string
          origin?: string
          retention_class?: string
          scope_id?: string | null
          source_event_id?: string | null
          source_reference?: Json | null
          summary?: string | null
          title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memories_scope_id_user_id_fkey"
            columns: ["scope_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scopes"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "memories_source_event_id_user_id_fkey"
            columns: ["source_event_id", "user_id"]
            isOneToOne: false
            referencedRelation: "domain_events"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "memories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          acknowledged_at: string | null
          attempt_no: number
          channel: string
          created_at: string
          dedupe_key: string
          delivered_at: string | null
          id: string
          notification_type: string
          payload: Json
          priority: string
          scheduled_at: string | null
          sent_at: string | null
          status: string
          suppression_reason: string | null
          user_id: string
          workflow_run_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          attempt_no?: number
          channel: string
          created_at?: string
          dedupe_key: string
          delivered_at?: string | null
          id?: string
          notification_type: string
          payload: Json
          priority: string
          scheduled_at?: string | null
          sent_at?: string | null
          status: string
          suppression_reason?: string | null
          user_id: string
          workflow_run_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          attempt_no?: number
          channel?: string
          created_at?: string
          dedupe_key?: string
          delivered_at?: string | null
          id?: string
          notification_type?: string
          payload?: Json
          priority?: string
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          suppression_reason?: string | null
          user_id?: string
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_workflow_run_id_user_id_fkey"
            columns: ["workflow_run_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      objectives: {
        Row: {
          completed_at: string | null
          created_at: string
          goal_id: string | null
          id: string
          importance: number
          origin: string
          scope_id: string | null
          status: string
          success_criteria: string | null
          target_date: string | null
          title: string
          user_id: string
          work_context_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          goal_id?: string | null
          id?: string
          importance: number
          origin: string
          scope_id?: string | null
          status: string
          success_criteria?: string | null
          target_date?: string | null
          title: string
          user_id: string
          work_context_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          goal_id?: string | null
          id?: string
          importance?: number
          origin?: string
          scope_id?: string | null
          status?: string
          success_criteria?: string | null
          target_date?: string | null
          title?: string
          user_id?: string
          work_context_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objectives_goal_id_user_id_fkey"
            columns: ["goal_id", "user_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "objectives_scope_id_user_id_fkey"
            columns: ["scope_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scopes"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "objectives_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objectives_work_context_id_user_id_fkey"
            columns: ["work_context_id", "user_id"]
            isOneToOne: false
            referencedRelation: "work_contexts"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      outbox_events: {
        Row: {
          attempt_count: number
          available_at: string
          created_at: string
          event_type: string
          id: string
          idempotency_key: string
          last_error: string | null
          max_attempts: number
          payload: Json
          processed_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          available_at: string
          created_at?: string
          event_type: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          max_attempts: number
          payload: Json
          processed_at?: string | null
          status: string
          user_id: string
        }
        Update: {
          attempt_count?: number
          available_at?: string
          created_at?: string
          event_type?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          max_attempts?: number
          payload?: Json
          processed_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbox_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      outcomes: {
        Row: {
          created_at: string
          id: string
          learning_case_id: string
          observed_at: string
          outcome_type: string
          payload: Json
          score: number | null
          source_event_id: string | null
          success: boolean | null
          summary: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          learning_case_id: string
          observed_at: string
          outcome_type: string
          payload?: Json
          score?: number | null
          source_event_id?: string | null
          success?: boolean | null
          summary?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          learning_case_id?: string
          observed_at?: string
          outcome_type?: string
          payload?: Json
          score?: number | null
          source_event_id?: string | null
          success?: boolean | null
          summary?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outcomes_learning_case_id_user_id_fkey"
            columns: ["learning_case_id", "user_id"]
            isOneToOne: false
            referencedRelation: "learning_cases"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "outcomes_source_event_id_user_id_fkey"
            columns: ["source_event_id", "user_id"]
            isOneToOne: false
            referencedRelation: "domain_events"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "outcomes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parsed_entities: {
        Row: {
          confidence: number
          created_at: string
          domain_command_id: string | null
          entity_type: string
          id: string
          inbox_item_id: string
          processing_status: string
          requires_confirmation: boolean
          structured_data: Json
          user_id: string
        }
        Insert: {
          confidence: number
          created_at?: string
          domain_command_id?: string | null
          entity_type: string
          id?: string
          inbox_item_id: string
          processing_status: string
          requires_confirmation: boolean
          structured_data: Json
          user_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          domain_command_id?: string | null
          entity_type?: string
          id?: string
          inbox_item_id?: string
          processing_status?: string
          requires_confirmation?: boolean
          structured_data?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parsed_entities_domain_command_id_user_id_fkey"
            columns: ["domain_command_id", "user_id"]
            isOneToOne: false
            referencedRelation: "domain_commands"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "parsed_entities_inbox_item_id_user_id_fkey"
            columns: ["inbox_item_id", "user_id"]
            isOneToOne: false
            referencedRelation: "inbox_items"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "parsed_entities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pattern_evidence: {
        Row: {
          direction: string
          learning_case_id: string
          observed_at: string
          pattern_id: string
          weight: number
        }
        Insert: {
          direction: string
          learning_case_id: string
          observed_at: string
          pattern_id: string
          weight: number
        }
        Update: {
          direction?: string
          learning_case_id?: string
          observed_at?: string
          pattern_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "pattern_evidence_learning_case_id_fkey"
            columns: ["learning_case_id"]
            isOneToOne: false
            referencedRelation: "learning_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pattern_evidence_pattern_id_fkey"
            columns: ["pattern_id"]
            isOneToOne: false
            referencedRelation: "patterns"
            referencedColumns: ["id"]
          },
        ]
      }
      patterns: {
        Row: {
          condition: Json
          confidence: number
          created_at: string
          evaluator_version: string
          evidence_count: number
          first_observed_at: string
          id: string
          last_observed_at: string
          observed_behavior: string
          pattern_type: string
          status: string
          user_id: string
        }
        Insert: {
          condition: Json
          confidence: number
          created_at?: string
          evaluator_version: string
          evidence_count: number
          first_observed_at: string
          id?: string
          last_observed_at: string
          observed_behavior: string
          pattern_type: string
          status: string
          user_id: string
        }
        Update: {
          condition?: Json
          confidence?: number
          created_at?: string
          evaluator_version?: string
          evidence_count?: number
          first_observed_at?: string
          id?: string
          last_observed_at?: string
          observed_behavior?: string
          pattern_type?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patterns_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_items: {
        Row: {
          activity_occurrence_id: string | null
          created_at: string
          daily_plan_id: string
          id: string
          item_type: string
          planned_end_at: string | null
          planned_minutes: number
          planned_start_at: string | null
          position: number
          status: string
          task_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_occurrence_id?: string | null
          created_at?: string
          daily_plan_id: string
          id?: string
          item_type: string
          planned_end_at?: string | null
          planned_minutes: number
          planned_start_at?: string | null
          position: number
          status: string
          task_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_occurrence_id?: string | null
          created_at?: string
          daily_plan_id?: string
          id?: string
          item_type?: string
          planned_end_at?: string | null
          planned_minutes?: number
          planned_start_at?: string | null
          position?: number
          status?: string
          task_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_items_activity_occurrence_id_user_id_fkey"
            columns: ["activity_occurrence_id", "user_id"]
            isOneToOne: false
            referencedRelation: "activity_occurrences"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "plan_items_daily_plan_id_user_id_fkey"
            columns: ["daily_plan_id", "user_id"]
            isOneToOne: false
            referencedRelation: "daily_plans"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "plan_items_task_id_user_id_fkey"
            columns: ["task_id", "user_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "plan_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      preferences: {
        Row: {
          confirmation_status: string
          created_at: string
          created_by: string
          id: string
          origin: string
          preference_key: string
          scope_id: string | null
          source_reference: Json | null
          user_id: string
          valid_from: string
          valid_until: string | null
          value: Json
        }
        Insert: {
          confirmation_status: string
          created_at?: string
          created_by: string
          id?: string
          origin: string
          preference_key: string
          scope_id?: string | null
          source_reference?: Json | null
          user_id: string
          valid_from: string
          valid_until?: string | null
          value: Json
        }
        Update: {
          confirmation_status?: string
          created_at?: string
          created_by?: string
          id?: string
          origin?: string
          preference_key?: string
          scope_id?: string | null
          source_reference?: Json | null
          user_id?: string
          valid_from?: string
          valid_until?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "preferences_scope_id_user_id_fkey"
            columns: ["scope_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scopes"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      principles: {
        Row: {
          approved_at: string | null
          confirmation_status: string
          created_at: string
          created_by: string
          id: string
          origin: string
          scope_id: string | null
          source_pattern_id: string | null
          source_reference: Json | null
          statement: string
          status: string
          user_id: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          approved_at?: string | null
          confirmation_status: string
          created_at?: string
          created_by: string
          id?: string
          origin: string
          scope_id?: string | null
          source_pattern_id?: string | null
          source_reference?: Json | null
          statement: string
          status: string
          user_id: string
          valid_from: string
          valid_until?: string | null
        }
        Update: {
          approved_at?: string | null
          confirmation_status?: string
          created_at?: string
          created_by?: string
          id?: string
          origin?: string
          scope_id?: string | null
          source_pattern_id?: string | null
          source_reference?: Json | null
          statement?: string
          status?: string
          user_id?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "principles_scope_id_user_id_fkey"
            columns: ["scope_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scopes"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "principles_source_pattern_id_user_id_fkey"
            columns: ["source_pattern_id", "user_id"]
            isOneToOne: false
            referencedRelation: "patterns"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "principles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          locale: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          locale?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          locale?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      recurring_activities: {
        Row: {
          active: boolean
          category: string
          created_at: string
          effective_from: string
          effective_until: string | null
          expected_minutes: number
          goal_id: string | null
          id: string
          importance: number
          minimum_minutes: number | null
          period: string
          preferred_days: number[] | null
          preferred_time_window: Json | null
          scheduling_mode: string
          target_count: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string
          effective_from: string
          effective_until?: string | null
          expected_minutes: number
          goal_id?: string | null
          id?: string
          importance: number
          minimum_minutes?: number | null
          period: string
          preferred_days?: number[] | null
          preferred_time_window?: Json | null
          scheduling_mode: string
          target_count: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          effective_from?: string
          effective_until?: string | null
          expected_minutes?: number
          goal_id?: string | null
          id?: string
          importance?: number
          minimum_minutes?: number | null
          period?: string
          preferred_days?: number[] | null
          preferred_time_window?: Json | null
          scheduling_mode?: string
          target_count?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_activities_goal_id_user_id_fkey"
            columns: ["goal_id", "user_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "recurring_activities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_jobs: {
        Row: {
          attempt_count: number
          created_at: string
          id: string
          job_key: string
          job_type: string
          last_error: string | null
          max_attempts: number
          payload: Json
          run_at: string
          status: string
          updated_at: string
          user_id: string
          workflow_run_id: string | null
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          id?: string
          job_key: string
          job_type: string
          last_error?: string | null
          max_attempts: number
          payload: Json
          run_at: string
          status: string
          updated_at?: string
          user_id: string
          workflow_run_id?: string | null
        }
        Update: {
          attempt_count?: number
          created_at?: string
          id?: string
          job_key?: string
          job_type?: string
          last_error?: string | null
          max_attempts?: number
          payload?: Json
          run_at?: string
          status?: string
          updated_at?: string
          user_id?: string
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_jobs_workflow_run_id_user_id_fkey"
            columns: ["workflow_run_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      scopes: {
        Row: {
          created_at: string
          id: string
          kind: string
          label: string
          parent_scope_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          label: string
          parent_scope_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          label?: string
          parent_scope_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scopes_parent_scope_id_user_id_fkey"
            columns: ["parent_scope_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scopes"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "scopes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      strategic_directives: {
        Row: {
          confirmation_status: string
          created_at: string
          created_by: string
          directive: string
          id: string
          origin: string
          priority_order: Json
          reason: string | null
          scope_id: string | null
          source_reference: Json | null
          user_id: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          confirmation_status: string
          created_at?: string
          created_by: string
          directive: string
          id?: string
          origin: string
          priority_order: Json
          reason?: string | null
          scope_id?: string | null
          source_reference?: Json | null
          user_id: string
          valid_from: string
          valid_until?: string | null
        }
        Update: {
          confirmation_status?: string
          created_at?: string
          created_by?: string
          directive?: string
          id?: string
          origin?: string
          priority_order?: Json
          reason?: string | null
          scope_id?: string | null
          source_reference?: Json | null
          user_id?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "strategic_directives_scope_id_user_id_fkey"
            columns: ["scope_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scopes"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "strategic_directives_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_steps: {
        Row: {
          completion_criteria: string | null
          created_at: string
          estimated_minutes: number | null
          id: string
          owner: string
          position: number
          status: string
          task_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completion_criteria?: string | null
          created_at?: string
          estimated_minutes?: number | null
          id?: string
          owner: string
          position: number
          status: string
          task_id: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completion_criteria?: string | null
          created_at?: string
          estimated_minutes?: number | null
          id?: string
          owner?: string
          position?: number
          status?: string
          task_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_steps_task_id_user_id_fkey"
            columns: ["task_id", "user_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "task_steps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          actual_minutes: number
          completed_at: string | null
          completion_criteria: string | null
          completion_source: string | null
          created_at: string
          description: string | null
          estimated_minutes: number | null
          estimated_user_minutes: number | null
          execution_mode: string
          id: string
          importance: number
          internal_deadline: string | null
          next_action: string | null
          objective_id: string | null
          official_deadline: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
          work_context_id: string | null
        }
        Insert: {
          actual_minutes?: number
          completed_at?: string | null
          completion_criteria?: string | null
          completion_source?: string | null
          created_at?: string
          description?: string | null
          estimated_minutes?: number | null
          estimated_user_minutes?: number | null
          execution_mode: string
          id?: string
          importance: number
          internal_deadline?: string | null
          next_action?: string | null
          objective_id?: string | null
          official_deadline?: string | null
          status: string
          title: string
          updated_at?: string
          user_id: string
          work_context_id?: string | null
        }
        Update: {
          actual_minutes?: number
          completed_at?: string | null
          completion_criteria?: string | null
          completion_source?: string | null
          created_at?: string
          description?: string | null
          estimated_minutes?: number | null
          estimated_user_minutes?: number | null
          execution_mode?: string
          id?: string
          importance?: number
          internal_deadline?: string | null
          next_action?: string | null
          objective_id?: string | null
          official_deadline?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
          work_context_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_objective_id_user_id_fkey"
            columns: ["objective_id", "user_id"]
            isOneToOne: false
            referencedRelation: "objectives"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_work_context_id_user_id_fkey"
            columns: ["work_context_id", "user_id"]
            isOneToOne: false
            referencedRelation: "work_contexts"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      tool_calls: {
        Row: {
          agent_run_id: string | null
          approval_request_id: string | null
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          input_hash: string
          latency_ms: number | null
          result_ref: string | null
          scope_id: string | null
          status: string
          tool_definition_id: string
          user_id: string
          workflow_run_id: string | null
        }
        Insert: {
          agent_run_id?: string | null
          approval_request_id?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          input_hash: string
          latency_ms?: number | null
          result_ref?: string | null
          scope_id?: string | null
          status: string
          tool_definition_id: string
          user_id: string
          workflow_run_id?: string | null
        }
        Update: {
          agent_run_id?: string | null
          approval_request_id?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          input_hash?: string
          latency_ms?: number | null
          result_ref?: string | null
          scope_id?: string | null
          status?: string
          tool_definition_id?: string
          user_id?: string
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tool_calls_agent_run_id_user_id_fkey"
            columns: ["agent_run_id", "user_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "tool_calls_approval_request_id_user_id_fkey"
            columns: ["approval_request_id", "user_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "tool_calls_scope_id_user_id_fkey"
            columns: ["scope_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scopes"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "tool_calls_tool_definition_id_user_id_fkey"
            columns: ["tool_definition_id", "user_id"]
            isOneToOne: false
            referencedRelation: "tool_definitions"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "tool_calls_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_calls_workflow_run_id_user_id_fkey"
            columns: ["workflow_run_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      tool_definitions: {
        Row: {
          active: boolean
          created_at: string
          data_access_class: string
          default_approval_policy: string
          destructive: boolean
          id: string
          idempotent: boolean
          mcp_server_connection_id: string | null
          open_world: boolean
          read_only: boolean
          side_effect_class: string
          source_type: string
          tool_key: string
          trust_level: string
          user_id: string
          version: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          data_access_class: string
          default_approval_policy: string
          destructive: boolean
          id?: string
          idempotent: boolean
          mcp_server_connection_id?: string | null
          open_world: boolean
          read_only: boolean
          side_effect_class: string
          source_type: string
          tool_key: string
          trust_level: string
          user_id: string
          version: string
        }
        Update: {
          active?: boolean
          created_at?: string
          data_access_class?: string
          default_approval_policy?: string
          destructive?: boolean
          id?: string
          idempotent?: boolean
          mcp_server_connection_id?: string | null
          open_world?: boolean
          read_only?: boolean
          side_effect_class?: string
          source_type?: string
          tool_key?: string
          trust_level?: string
          user_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_definitions_mcp_server_connection_id_user_id_fkey"
            columns: ["mcp_server_connection_id", "user_id"]
            isOneToOne: false
            referencedRelation: "mcp_server_connections"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "tool_definitions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_grants: {
        Row: {
          agent_instance_id: string
          approval_policy: string
          id: string
          permission: string
          scope_id: string | null
          tool_definition_id: string
          user_id: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          agent_instance_id: string
          approval_policy: string
          id?: string
          permission: string
          scope_id?: string | null
          tool_definition_id: string
          user_id: string
          valid_from: string
          valid_until?: string | null
        }
        Update: {
          agent_instance_id?: string
          approval_policy?: string
          id?: string
          permission?: string
          scope_id?: string | null
          tool_definition_id?: string
          user_id?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tool_grants_agent_instance_id_user_id_fkey"
            columns: ["agent_instance_id", "user_id"]
            isOneToOne: false
            referencedRelation: "agent_instances"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "tool_grants_scope_id_user_id_fkey"
            columns: ["scope_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scopes"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "tool_grants_tool_definition_id_user_id_fkey"
            columns: ["tool_definition_id", "user_id"]
            isOneToOne: false
            referencedRelation: "tool_definitions"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "tool_grants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          created_at: string
          monthly_ai_budget_krw: number | null
          notification_policy: Json
          planning_buffer_minutes: number
          planning_policy: Json
          updated_at: string
          user_id: string
          wake_policy: Json
          week_starts_on: number
        }
        Insert: {
          created_at?: string
          monthly_ai_budget_krw?: number | null
          notification_policy?: Json
          planning_buffer_minutes?: number
          planning_policy?: Json
          updated_at?: string
          user_id: string
          wake_policy?: Json
          week_starts_on?: number
        }
        Update: {
          created_at?: string
          monthly_ai_budget_krw?: number | null
          notification_policy?: Json
          planning_buffer_minutes?: number
          planning_policy?: Json
          updated_at?: string
          user_id?: string
          wake_policy?: Json
          week_starts_on?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      work_contexts: {
        Row: {
          agent_mode: string
          archived_at: string | null
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          kind: string
          scope_id: string | null
          start_date: string | null
          status: string
          title: string
          user_id: string
        }
        Insert: {
          agent_mode: string
          archived_at?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          kind: string
          scope_id?: string | null
          start_date?: string | null
          status: string
          title: string
          user_id: string
        }
        Update: {
          agent_mode?: string
          archived_at?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          kind?: string
          scope_id?: string | null
          start_date?: string | null
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_contexts_scope_id_user_id_fkey"
            columns: ["scope_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scopes"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "work_contexts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_runs: {
        Row: {
          checkpoint_state: Json
          checkpoint_version: number
          completed_at: string | null
          correlation_id: string
          current_step: string | null
          id: string
          idempotency_key: string
          started_at: string
          status: string
          updated_at: string
          user_id: string
          workflow_type: string
        }
        Insert: {
          checkpoint_state?: Json
          checkpoint_version: number
          completed_at?: string | null
          correlation_id: string
          current_step?: string | null
          id?: string
          idempotency_key: string
          started_at: string
          status: string
          updated_at?: string
          user_id: string
          workflow_type: string
        }
        Update: {
          checkpoint_state?: Json
          checkpoint_version?: number
          completed_at?: string | null
          correlation_id?: string
          current_step?: string | null
          id?: string
          idempotency_key?: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
          workflow_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approval_is_resumable: {
        Args: {
          p_action_hash: string
          p_approval_id: string
          p_checkpoint_version: number
        }
        Returns: boolean
      }
      effective_tool_permission: {
        Args: {
          p_agent_instance_id: string
          p_scope_id: string
          p_tool_definition_id: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

