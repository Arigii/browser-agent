import type { LLMClient } from '../llm/types.js';

export async function summarizeHistory(client: LLMClient, task: string, transcript: string): Promise<string> {
  const systemPrompt =
    "You compress an AI browser agent's action log into a short, factual recap so the main agent " +
    'can keep working with less context. Be terse and concrete. Preserve: which pages/sites were visited, ' +
    'what actions were taken, any data or results already found, and anything still outstanding. ' +
    'Never invent facts that are not in the log.';

  const userPrompt = `Overall task: ${task}\n\nAction log to compress:\n${transcript}\n\nWrite a compact recap (~150 words max).`;

  const summary = await client.completeText(systemPrompt, userPrompt);
  return summary || '(summary unavailable)';
}
