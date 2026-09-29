import { AnthropicClient } from './anthropicClient.js';
import { OpenAIClient } from './openaiClient.js';
import { GeminiClient } from './geminiClient.js';
import type { LLMClient } from './types.js';

export function createLLMClient(): LLMClient {
  const explicit = process.env.LLM_PROVIDER?.toLowerCase();
  const provider =
    explicit ||
    (process.env.GROQ_API_KEY
      ? 'groq'
      : process.env.ANTHROPIC_API_KEY
        ? 'anthropic'
        : process.env.GEMINI_API_KEY
          ? 'gemini'
          : 'openai');

  if (provider === 'groq') {
    const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('LLM_PROVIDER=groq but GROQ_API_KEY (or OPENAI_API_KEY) is not set.');
    const model = process.env.AGENT_MODEL || 'llama-3.1-8b-instant';
    const baseURL = process.env.OPENAI_BASE_URL || 'https://api.groq.com/openai/v1';
    return new OpenAIClient(apiKey, model, baseURL);
  }

  if (provider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set.');
    return new AnthropicClient(apiKey, process.env.AGENT_MODEL || 'claude-sonnet-5');
  }

  if (provider === 'gemini' || provider === 'google') {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('LLM_PROVIDER=gemini but GEMINI_API_KEY is not set.');
    return new GeminiClient(apiKey, process.env.AGENT_MODEL || 'gemini-2.5-flash');
  }

  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('LLM_PROVIDER=openai but OPENAI_API_KEY is not set.');
    return new OpenAIClient(apiKey, process.env.AGENT_MODEL || 'gpt-4.1', process.env.OPENAI_BASE_URL || undefined);
  }

  throw new Error(`Unknown LLM_PROVIDER "${provider}". Use "groq", "anthropic", "gemini", or "openai".`);
}
