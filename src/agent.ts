import type { BrowserController } from './browser.js';
import type { ConversationTurn, LLMClient, ToolCallRequest } from './llm/types.js';
import { TOOLS } from './tools.js';
import { summarizeHistory } from './subagents/summarizer.js';
import type { ElementInfo, PageState } from './types.js';

const MAX_STEPS = 60;
const SUMMARIZE_EVERY_N_STEPS = 8;
const KEEP_RAW_TURNS = 6;
const MAX_ELEMENTS_PER_STEP = 70;
const WAIT_CAP_SECONDS = 2;

function formatPageState(state: PageState): string {
  const total = state.elements.length;
  const sliced = state.elements.slice(0, MAX_ELEMENTS_PER_STEP);

  const lines = sliced.map((e: ElementInfo) => {
    const visibleTag = e.inViewport ? '[VISIBLE]' : '[OFFSCREEN]';
    const disabledTag = e.disabled ? '[DISABLED/LOCKED]' : '';
    const parts = [`[${e.id}] ${visibleTag}${disabledTag} <${e.tag}${e.type ? ' type=' + e.type : ''}>`, `"${e.label}"`];
    if (e.href) parts.push(`href="${e.href}"`);
    return parts.join(' ');
  });

  if (total > MAX_ELEMENTS_PER_STEP) {
    lines.push(`(...and ${total - MAX_ELEMENTS_PER_STEP} more elements hidden. Use search or scroll if needed.)`);
  }

  return [
    `URL: ${state.url}`,
    `Title: ${state.title}`,
    `Scroll Position: ${state.scrollPercent}% down the page`,
    `Interactive elements (prioritized by visibility):`,
    lines.join('\n') || '(none)',
  ].join('\n');
}

function collapseOlderPageStates(turns: ConversationTurn[]): ConversationTurn[] {
  const cloned = JSON.parse(JSON.stringify(turns)) as ConversationTurn[];
  const pageStateIndexes: number[] = [];

  cloned.forEach((turn, idx) => {
    if (turn.role === 'user' && turn.text.startsWith('URL:')) pageStateIndexes.push(idx);
  });

  for (let i = 0; i < pageStateIndexes.length - 1; i++) {
    const turn = cloned[pageStateIndexes[i]];
    if (turn.role === 'user') {
      const urlLine = turn.text.split('\n')[0] || '';
      turn.text = `[Previous step snapshot at ${urlLine}]`;
    }
  }

  return cloned;
}

export type AskHuman = (question: string) => Promise<string>;
export type Confirm = (actionDescription: string) => Promise<boolean>;

interface AgentOptions {
  client: LLMClient;
  browser: BrowserController;
  askHuman: AskHuman;
  confirm: Confirm;
  log: (msg: string) => void;
}

const SYSTEM_PROMPT = `You are a fully autonomous browser agent.

CRITICAL RULES:
1. NEVER call "scroll" if the page has reached 100% scroll position or if scrolling changes nothing!
2. You MUST click one of the interactive elements listed with [VISIBLE].
3. NEVER click an element marked with [DISABLED/LOCKED]. If "Next" or "Customize" is locked, select an item option or size above it first.
4. Do NOT call "scroll" more than once if new elements do not appear.
5. Call "finish" immediately after adding an item to the cart or completing the goal.`;

export class Agent {
  constructor(private opts: AgentOptions) {}

  async run(task: string): Promise<void> {
    const { client, browser, log } = this.opts;
    const turns: ConversationTurn[] = [{ role: 'user', text: `Task: ${task}` }];
    let stepsSinceSummary = 0;

    let lastClickedId: number | null = null;
    let sameClickCount = 0;
    let scrollStreak = 0;
    let lastScrollPercent = -1;
    let lastElementsCount = -1;

    for (let step = 0; step < MAX_STEPS; step++) {
      const state = await browser.getState();
      const pageStateText = formatPageState(state);

      log(`\n--- [Step ${step + 1}] DOM Elements: ${state.elements.length} | Scroll: ${state.scrollPercent}% ---`);

      turns.push({ role: 'user', text: pageStateText });
      const payloadTurns = collapseOlderPageStates(turns);

      let response;
      try {
        response = await client.complete(SYSTEM_PROMPT, TOOLS as any, payloadTurns);
      } catch (err: any) {
        log(`\n⚠️ ${client.providerName} API error: ${err.message || err}. Retrying in 2s...\n`);
        await new Promise((r) => setTimeout(r, 2000));
        response = await client.complete(SYSTEM_PROMPT, TOOLS as any, payloadTurns);
      }

      if (response.toolCalls.length === 0) {
        const jsonMatch = response.text.trim().match(/\{[\s\S]*"name"[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.name) {
              response.toolCalls.push({
                id: 'local_' + Date.now(),
                name: parsed.name,
                input: parsed.arguments || parsed.input || {},
              });
            }
          } catch {}
        }
      }

      turns.push({ role: 'assistant', text: response.text, toolCalls: response.toolCalls });
      if (response.text.trim()) log(`🤖 ${response.text.trim()}`);

      if (response.toolCalls.length === 0) {
        turns.push({
          role: 'user',
          text: 'You MUST call a tool (like "click", "type_text", "scroll" or "finish"). Do not output plain text.',
        });
        continue;
      }

      const firstCall = response.toolCalls[0];

      if (firstCall && firstCall.name === 'scroll') {
        if (state.scrollPercent === lastScrollPercent && state.elements.length === lastElementsCount) {
          scrollStreak++;
        } else {
          scrollStreak = 1;
        }
        lastScrollPercent = state.scrollPercent;
        lastElementsCount = state.elements.length;

        if (scrollStreak >= 2 || state.scrollPercent >= 98) {
          log(`\n⚠️ Intercepted useless scroll loop (scroll = ${state.scrollPercent}%). Forcing click action.\n`);
          turns.push({
            role: 'user',
            text: `SYSTEM ERROR: Scrolling is NOT revealing any new content! You are at ${state.scrollPercent}% scroll position. STOP SCROLLING IMMEDIATELY and click one of the available [VISIBLE] button IDs listed above!`,
          });
          scrollStreak = 0;
          continue;
        }
      } else {
        scrollStreak = 0;
      }

      if (firstCall && firstCall.name === 'click') {
        const currentId = Number(firstCall.input?.id);
        if (currentId === lastClickedId) {
          sameClickCount++;
        } else {
          sameClickCount = 0;
          lastClickedId = currentId;
        }

        if (sameClickCount >= 1) {
          log(`\n⚠️ Intercepted repeated click on ID ${currentId}. Forcing new choice.\n`);
          turns.push({
            role: 'user',
            text: `SYSTEM ERROR: You clicked ID [${currentId}] again. Look at the element list above and output a "click" action with a DIFFERENT ID!`,
          });
          lastClickedId = null;
          sameClickCount = 0;
          continue;
        }
      } else {
        lastClickedId = null;
        sameClickCount = 0;
      }

      let finished = false;
      const results: { toolCallId: string; toolName: string; content: string; isError?: boolean }[] = [];

      for (const tc of response.toolCalls) {
        const result = await this.executeTool(tc);
        results.push({ toolCallId: tc.id, toolName: tc.name, content: result.content, isError: result.isError });
        if (tc.name === 'finish') {
          finished = true;
          log(`\n${tc.input.success ? '✅' : '🛑'} ${tc.input.summary}\n`);
        }
      }

      turns.push({ role: 'tool_results', results });
      if (finished) return;

      stepsSinceSummary++;
      if (stepsSinceSummary >= SUMMARIZE_EVERY_N_STEPS && turns.length > KEEP_RAW_TURNS + 1) {
        await this.compressHistory(turns, task);
        stepsSinceSummary = 0;
      }
    }

    log('\n⚠️ Reached maximum steps.\n');
  }

  private async compressHistory(turns: ConversationTurn[], task: string) {
    const head = turns[0];
    const tail = turns.slice(-KEEP_RAW_TURNS);
    const middle = turns.slice(1, turns.length - tail.length);
    if (middle.length === 0) return;

    const transcript = middle.map((t) => JSON.stringify(t)).join('\n').slice(0, 6000);
    const summary = await summarizeHistory(this.opts.client, task, transcript);

    turns.splice(0, turns.length, head, { role: 'user', text: `[History summary]: ${summary}` }, ...tail);
    this.opts.log('🗜️ (compressed history)');
  }

  private async executeTool(tc: ToolCallRequest): Promise<{ content: string; isError?: boolean }> {
    const { browser, askHuman, confirm } = this.opts;
    const input = tc.input;
    try {
      switch (tc.name) {
        case 'click':
          await browser.click(input.id);
          return { content: 'Clicked.' };
        case 'type_text':
          await browser.type(input.id, input.text, !!input.submit);
          return { content: 'Typed.' };
        case 'press_key':
          await browser.pressKey(input.key);
          return { content: 'Key pressed.' };
        case 'scroll':
          await browser.scroll(input.direction, input.amount ?? 'page');
          return { content: 'Scrolled.' };
        case 'navigate':
          await browser.navigate(input.url);
          return { content: 'Navigated.' };
        case 'go_back':
          await browser.goBack();
          return { content: 'Went back.' };
        case 'extract_text': {
          const text = await browser.extractText(input.id);
          return { content: text || '(empty)' };
        }
        case 'wait':
          await new Promise((r) => setTimeout(r, Math.min(WAIT_CAP_SECONDS, input.seconds) * 1000));
          return { content: 'Waited.' };
        case 'ask_user': {
          const answer = await askHuman(input.question);
          return { content: answer };
        }
        case 'request_confirmation': {
          const approved = await confirm(input.action_description);
          return { content: approved ? 'Approved.' : 'DENIED by user.', isError: !approved };
        }
        case 'finish':
          return { content: 'Task finished.' };
        default:
          return { content: `Unknown tool: ${tc.name}`, isError: true };
      }
    } catch (err: any) {
      return { content: `Error: ${err.message || err}`, isError: true };
    }
  }
}
