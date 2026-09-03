import type { AIInterpreter } from "./ai-interpreter.js";
import type { ParseInput, ParseResult } from "./contracts.js";

export class DeterministicTestInterpreter implements AIInterpreter {
  constructor(private readonly fixture?: ParseResult | ((input: ParseInput) => ParseResult)) {}

  async parseInput(input: ParseInput): Promise<ParseResult> {
    if (typeof this.fixture === "function") return this.fixture(input);
    if (this.fixture) return this.fixture;
    return {
      intent: "CREATE_TASK",
      entities: [{
        entityType: "task_candidate",
        data: { title: input.text, inferredFields: [] },
        provenance: { title: "user_explicit" },
        confidence: 1
      }],
      requiresConfirmation: false,
      clarificationQuestions: []
    };
  }
}
