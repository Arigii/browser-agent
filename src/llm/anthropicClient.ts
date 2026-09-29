import Anthropic from '@anthropic-ai/sdk';
import type { ConversationTurn, LLMClient, LLMResponse, ToolSpec } from './types.js';

export class AnthropicClient implements LLMClient {
  readonly providerName = 'anthropic';
  private client: Anthropic;

  constructor(apiKey: string, readonly model: string) {
    this.client = new Anthropic({ apiKey });
  }

  private toMessages(turns: ConversationTurn[]): Anthropic.MessageParam[] {
    return turns.map((turn): Anthropic.MessageParam => {
      if (turn.role === 'user') {
        return { role: 'user', content: turn.text };
      }
      if (turn.role === 'assistant') {
        const content: Array<Anthropic.TextBlockParam | Anthropic.ToolUseBlockParam> = [];
        if (turn.text) content.push({ type: 'text', text: turn.text });
        for (const tc of turn.toolCalls) {
          content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
        }
        return { role: 'assistant', content };
      }
      return {
        role: 'user',
        content: turn.results.map(
          (r): Anthropic.ToolResultBlockParam => ({
            type: 'tool_result',
            tool_use_id: r.toolCallId,
            content: r.content,
            is_error: r.isError,
          }),
        ),
      };
    });
  }

  async complete(systemPrompt: string, tools: ToolSpec[], turns: ConversationTurn[]): Promise<LLMResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: systemPrompt,
      tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters as any })),
      messages: this.toMessages(turns),
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    const toolCalls = response.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      .map((b) => ({ id: b.id, name: b.name, input: b.input as Record<string, any> }));

    return { text, toolCalls };
  }

  async completeText(systemPrompt: string, userPrompt: string): Promise<string> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const block = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    return block?.text ?? '';
  }
}
