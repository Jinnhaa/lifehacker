import { parseResultSchema, type ParseInput, type ParseResult } from "./contracts.js";

export interface AIInterpreter {
  parseInput(input: ParseInput): Promise<ParseResult>;
}

export interface StructuredOutputProvider {
  generateStructuredOutput(input: ParseInput): Promise<unknown>;
}

export class ProviderAIInterpreter implements AIInterpreter {
  constructor(private readonly provider: StructuredOutputProvider) {}

  async parseInput(input: ParseInput): Promise<ParseResult> {
    return parseResultSchema.parse(await this.provider.generateStructuredOutput(input));
  }
}
