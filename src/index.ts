import 'dotenv/config';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { BrowserController } from './browser.js';
import { Agent } from './agent.js';
import { createLLMClient } from './llm/factory.js';

async function main() {
  let client;
  try {
    client = createLLMClient();
  } catch (err: any) {
    console.error(err.message || err);
    console.error('See .env.example for the environment variables each provider needs.');
    process.exit(1);
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const browser = new BrowserController();

  console.log(`Using provider: ${client.providerName} (model: ${client.model})`);
  if (client.providerName === 'openai') {
    const baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1 (default — OPENAI_BASE_URL not set!)';
    const key = process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY || '';
    console.log(`  base URL: ${baseURL}`);
    console.log(`  API key:  ${key.slice(0, 6)}...${key.slice(-4)} (${key.length} chars)`);
  }
  console.log('Launching browser (persistent profile in ./browser-profile)...');
  await browser.launch('./browser-profile');

  const agent = new Agent({
    client,
    browser,
    log: (msg) => console.log(msg),
    askHuman: async (q) => rl.question(`\n❓ Agent asks: ${q}\n> `),
    confirm: async (action) => {
      const answer = await rl.question(`\n⚠️  Agent wants to: ${action}\nApprove? (y/n) > `);
      return answer.trim().toLowerCase().startsWith('y');
    },
  });

  console.log('\nBrowser agent ready.');
  console.log('If a task needs you to be logged in, you can log in by hand in the browser window first —');
  console.log('the session persists across runs, the agent will just continue from wherever you leave it.');
  console.log('Type a task and press Enter. Type "exit" to quit.\n');

  for (;;) {
    const task = await rl.question('Task> ');
    if (!task.trim()) continue;
    if (task.trim().toLowerCase() === 'exit') break;
    try {
      await agent.run(task.trim());
    } catch (err: any) {
      console.error('Agent run failed:', err.message || err);
    }
  }

  rl.close();
  await browser.close();
  process.exit(0);
}

main();
