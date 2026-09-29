import OpenAI from 'openai';
import type { ConversationTurn, LLMClient, LLMResponse, ToolSpec } from './types.js';

export class OpenAIClient implements LLMClient {
  readonly providerName = 'openai';
  private client: OpenAI;

  constructor(apiKey: string, readonly model: string, baseURL?: string) {
    this.client = new OpenAI({ apiKey, baseURL });
  }

  private toMessages(systemPrompt: string, turns: ConversationTurn[]): OpenAI.Chat.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: 'system', content: systemPrompt }];
    for (const turn of turns) {
      if (turn.role === 'user') {
        messages.push({ role: 'user', content: turn.text });
      } else if (turn.role === 'assistant') {
        messages.push({
          role: 'assistant',
          content: turn.text || null,
          tool_calls: turn.toolCalls.length
            ? turn.toolCalls.map((tc) => ({
                id: tc.id,
                type: 'function' as const,
                function: { name: tc.name, arguments: JSON.stringify(tc.input) },
              }))
            : undefined,
        });
      } else {
        const combined = turn.results.map((r) => `Tool "${r.toolName}" (${r.toolCallId}) result: ${r.content}`).join('\n');
        messages.push({ role: 'user', content: combined });
      }
    }
    return messages;
  }

  async complete(systemPrompt: string, tools: ToolSpec[], turns: ConversationTurn[]): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: this.toMessages(systemPrompt, turns),
      tools: tools.map((t) => ({
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: t.parameters },
      })),
      tool_choice: 'auto',
      temperature: 0.1,
    });

    const choice = response.choices[0]?.message;
    const toolCalls = (choice?.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      input: safeParseJSON(tc.function.arguments),
    }));

    return { text: choice?.content ?? '', toolCalls };
  }

  async completeText(systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
    });
    return response.choices[0]?.message?.content ?? '';
  }
}

function safeParseJSON(s: string): Record<string, any> {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
