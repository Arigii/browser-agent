export const TOOLS = [
  {
    name: 'click',
    description: 'Click an interactive element on the page by its numeric [id] from the element list.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'number', description: 'The [id] of the element to click' } },
      required: ['id'],
    },
  },
  {
    name: 'type_text',
    description:
      'Click an input/textarea/contenteditable element by id, clear its current value, and type the given text.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        text: { type: 'string' },
        submit: { type: 'boolean', description: 'Press Enter after typing, e.g. to submit a search box' },
      },
      required: ['id', 'text'],
    },
  },
  {
    name: 'press_key',
    description: 'Press a single keyboard key, e.g. "Enter", "Escape", "Tab", "PageDown".',
    parameters: {
      type: 'object',
      properties: { key: { type: 'string' } },
      required: ['key'],
    },
  },
  {
    name: 'scroll',
    description: 'Scroll the page to reveal more elements that are currently off-screen.',
    parameters: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down'] },
        amount: { type: 'string', enum: ['small', 'page'] },
      },
      required: ['direction'],
    },
  },
  {
    name: 'navigate',
    description:
      'Go directly to a URL in the current tab (only when you already know the exact URL, e.g. from a visible link href or a search engine result).',
    parameters: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
    },
  },
  {
    name: 'go_back',
    description: 'Go back to the previous page in browser history.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'extract_text',
    description:
      'Read the full text content of one specific element by id, e.g. an article body, a table cell, or a price. Use this instead of guessing content from the short label.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'number' } },
      required: ['id'],
    },
  },
  {
    name: 'wait',
    description: 'Wait for a number of seconds (max 2), e.g. while a slow page finishes loading.',
    parameters: {
      type: 'object',
      properties: { seconds: { type: 'number' } },
      required: ['seconds'],
    },
  },
  {
    name: 'ask_user',
    description:
      'EMERGENCY ONLY. Use ONLY when completely blocked by a CAPTCHA or missing secret credentials (2FA/passwords). NEVER use this tool to ask for user preferences, item choices, combo options, or general confirmation. Choose yourself!',
    parameters: {
      type: 'object',
      properties: { question: { type: 'string' } },
      required: ['question'],
    },
  },
  {
    name: 'request_confirmation',
    description:
      'REQUIRED ONLY before making actual financial payments, placing final paid orders, or submitting sensitive personal data. DO NOT use for simply adding items to a shopping cart or navigating.',
    parameters: {
      type: 'object',
      properties: { action_description: { type: 'string' } },
      required: ['action_description'],
    },
  },
  {
    name: 'finish',
    description: 'Call this once the task is fully complete, or once you are certain it cannot be completed.',
    parameters: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        summary: { type: 'string', description: 'What was done (or why it could not be done), for the user.' },
      },
      required: ['success', 'summary'],
    },
  },
] as const;