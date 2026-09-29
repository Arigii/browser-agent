# browser-agent

An autonomous AI agent that controls a real, visible web browser to complete multi-step tasks — no site-specific scripts, no hardcoded selectors. On every step it reads the current page's interactive elements straight from the live DOM and decides what to click or type itself.

## How it works

- **Browser control**: [Playwright](https://playwright.dev) drives a persistent, non-headless Chromium profile, so logins survive between runs and you can watch it work.
- **Element discovery, not hardcoding**: a small in-page script (`src/browser.ts`) walks the DOM on every step, finds anything interactive (links, buttons, inputs, `role="..."` elements, etc.), and tags each one with a fresh numeric id. The model only ever sees a compact list like `[3] [VISIBLE] <button> "Add to cart"` — never raw HTML, and nothing about any specific website is baked into the code.
- **Provider-agnostic LLM layer** (`src/llm/`): the agent talks to models through one internal interface (`LLMClient`). Swapping providers is a `.env` change, not a code change. Supported out of the box: Anthropic (Claude), OpenAI, Google Gemini, and Groq (or any other OpenAI-compatible endpoint, including local model servers).
- **Context management**: the element list is capped per step, older full-page snapshots in the conversation get collapsed to a one-line placeholder once a newer one exists, and a dedicated summarizer sub-agent periodically compresses older history into a short recap so long tasks don't blow the context window.
- **Sub-agent**: `src/subagents/summarizer.ts` is a separate, focused LLM call whose only job is compressing the action log — it doesn't share context with the main decision loop.
- **Error handling & anti-loop guards**: failed tool calls are fed back to the model as errors instead of crashing the run; the agent also detects and interrupts pointless scroll loops and repeated identical clicks, redirecting the model instead of burning steps (and API quota) on them.
- **Security layer**: before anything irreversible — payment, sending something, deleting something — the agent must call `request_confirmation` and wait for a `y/n` in the terminal. A separate `ask_user` tool lets it pause and ask a genuine question (missing credentials, a CAPTCHA it can't solve) rather than guessing.

## Setup

```bash
npm install
npx playwright install chromium   # downloads the browser binary, one-time
cp .env.example .env              # fill in one provider section
npm run build
npm start
```

A visible browser window opens, and the terminal gives you a `Task>` prompt. Type a task in plain language and press Enter. If a site needs a login, sign in by hand in that window the first time — the session is saved in `./browser-profile` and reused on future runs.

## Choosing a provider

Only `LLM_PROVIDER` plus that provider's own variables are needed; see `.env.example` for all four:

| Provider | `LLM_PROVIDER` | Required env var | Notes |
|---|---|---|---|
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY` | Most reliable tool calling in practice |
| OpenAI | `openai` | `OPENAI_API_KEY` | |
| Google Gemini | `gemini` | `GEMINI_API_KEY` | |
| Groq | `groq` | `GROQ_API_KEY` | Free tier, but very tight per-minute token limits |

`OPENAI_BASE_URL` can point the OpenAI client at any OpenAI-compatible endpoint instead — a local server like Ollama or LM Studio, for example — since Groq and most local runtimes speak the same protocol.

## A note on the current tuning

This was built and tested mostly against a free-tier hosted model with a small per-minute token budget, and separately against a local model too slow to be pleasant. Both constraints show up in the code: the interactive-element list is capped fairly aggressively per step, repeated scrolling/clicking gets interrupted after one retry instead of several, and `wait` is capped at 2 seconds. These are reasonable defaults for a fast paid model too, but if you're running one, you can loosen `MAX_ELEMENTS_PER_STEP`, `WAIT_CAP_SECONDS`, and the loop-guard thresholds in `src/agent.ts`.

## Project layout

```
src/
  browser.ts        Playwright wrapper: persistent context, runtime element extraction, actions
  tools.ts           Provider-neutral tool schemas (JSON schema)
  llm/
    types.ts         LLMClient interface + neutral conversation-turn format
    anthropicClient.ts
    openaiClient.ts   also used for Groq / any OpenAI-compatible endpoint
    geminiClient.ts
    factory.ts        picks a provider from env vars
  agent.ts           Main loop: tool-calling orchestration, loop guards, history compression
  subagents/
    summarizer.ts    History-compressing sub-agent
  index.ts           CLI entry point
```

## License

MIT — see [LICENSE](LICENSE).
