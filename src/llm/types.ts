export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface ToolCallRequest {
  id: string;
  name: string;
  input: Record<string, any>;
}

export interface ToolResultEntry {
  toolCallId: string;
  toolName: string;
  content: string;
  isError?: boolean;
}

export type ConversationTurn =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text?: string; toolCalls: ToolCallRequest[] }
  | { role: 'tool_results'; results: ToolResultEntry[] };

export interface LLMResponse {
  text: string;
  toolCalls: ToolCallRequest[];
}

export interface LLMClient {
  readonly providerName: string;
  readonly model: string;
  complete(systemPrompt: string, tools: ToolSpec[], turns: ConversationTurn[]): Promise<LLMResponse>;
  completeText(systemPrompt: string, userPrompt: string): Promise<string>;
}
