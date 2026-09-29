import { GoogleGenAI } from '@google/genai';
import type { ConversationTurn, LLMClient, LLMResponse, ToolCallRequest, ToolSpec } from './types.js';

export class GeminiClient implements LLMClient {
  readonly providerName = 'gemini';
  private ai: GoogleGenAI;

  constructor(apiKey: string, readonly model: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  private toContents(turns: ConversationTurn[]) {
    const contents: Array<{ role: string; parts: any[] }> = [];

    for (const turn of turns) {
      if (turn.role === 'user') {
        contents.push({ role: 'user', parts: [{ text: turn.text }] });
      } else if (turn.role === 'assistant') {
        const parts: any[] = [];
        if (turn.text) parts.push({ text: turn.text });
        for (const tc of turn.toolCalls) {
          parts.push({ functionCall: { name: tc.name, args: tc.input } });
        }
        contents.push({ role: 'model', parts });
      } else {
        const parts = turn.results.map((r) => ({
          functionResponse: { name: r.toolName, response: { output: r.content } },
        }));
        contents.push({ role: 'user', parts });
      }
    }
    return contents;
  }

  async complete(systemPrompt: string, tools: ToolSpec[], turns: ConversationTurn[]): Promise<LLMResponse> {
    const contents = this.toContents(turns);

    const geminiTools =
      tools.length > 0
        ? [
            {
              functionDeclarations: tools.map((t) => ({
                name: t.name,
                description: t.description,
                parameters: t.parameters,
              })),
            },
          ]
        : undefined;

    const response = await this.ai.models.generateContent({
      model: this.model,
      contents,
      config: { systemInstruction: systemPrompt, tools: geminiTools },
    });

    let text = '';
    const toolCalls: ToolCallRequest[] = [];

    const candidateParts = response.candidates?.[0]?.content?.parts ?? [];
    for (const part of candidateParts) {
      if (part.text) text += part.text;
      if (part.functionCall) {
        toolCalls.push({
          id: `call_${Math.random().toString(36).slice(2, 9)}`,
          name: part.functionCall.name ?? '',
          input: (part.functionCall.args as Record<string, any>) ?? {},
        });
      }
    }

    return { text, toolCalls };
  }

  async completeText(systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: userPrompt,
      config: { systemInstruction: systemPrompt },
    });
    return response.text ?? '';
  }
}
