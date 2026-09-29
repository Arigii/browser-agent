import { chromium, type BrowserContext, type Page } from 'playwright';
import type { ElementInfo, PageState } from './types.js';

async function extractPageState(page: Page): Promise<PageState> {
  return page.evaluate(() => {
    const SELECTOR = [
      'a[href]',
      'button',
      'input',
      'textarea',
      'select',
      '[role="button"]',
      '[role="link"]',
      '[role="checkbox"]',
      '[role="menuitem"]',
      '[role="tab"]',
      '[role="option"]',
      '[role="combobox"]',
      '[contenteditable="true"]',
      'summary',
      '[onclick]',
    ].join(', ');

    document.querySelectorAll('[data-agent-id]').forEach((el) => el.removeAttribute('data-agent-id'));

    const nodes = Array.from(document.querySelectorAll(SELECTOR)) as HTMLElement[];
    const rawElements: {
      el: HTMLElement;
      tag: string;
      type?: string;
      role?: string;
      label: string;
      href?: string;
      inViewport: boolean;
      disabled: boolean;
    }[] = [];

    const vh = window.innerHeight;
    const vw = window.innerWidth;

    for (const el of nodes) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      const style = window.getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') continue;

      let label = (
        el.getAttribute('aria-label') ||
        el.innerText ||
        el.getAttribute('placeholder') ||
        el.getAttribute('value') ||
        el.getAttribute('alt') ||
        el.getAttribute('title') ||
        ''
      )
        .toString()
        .trim();
      label = label.replace(/\s+/g, ' ').slice(0, 120);

      if (!label && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') continue;

      const inViewport = rect.top >= 0 && rect.top <= vh && rect.left >= 0 && rect.left <= vw;
      const isDisabled =
        el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled');

      rawElements.push({
        el,
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || undefined,
        role: el.getAttribute('role') || undefined,
        label: label || '(empty)',
        href: el.tagName === 'A' ? (el.getAttribute('href') || '').slice(0, 200) : undefined,
        inViewport,
        disabled: isDisabled,
      });
    }

    rawElements.sort((a, b) => (b.inViewport ? 1 : 0) - (a.inViewport ? 1 : 0));

    const results: {
      id: number;
      tag: string;
      type?: string;
      role?: string;
      label: string;
      href?: string;
      inViewport: boolean;
      disabled: boolean;
    }[] = [];
    let id = 1;

    for (const item of rawElements) {
      item.el.setAttribute('data-agent-id', String(id));
      results.push({
        id,
        tag: item.tag,
        type: item.type,
        role: item.role,
        label: item.label,
        href: item.href,
        inViewport: item.inViewport,
        disabled: item.disabled,
      });
      id++;
    }

    return {
      url: location.href,
      title: document.title,
      scrollPercent: Math.round((window.scrollY / Math.max(1, document.body.scrollHeight - vh)) * 100),
      elements: results,
    };
  });
}

export class BrowserController {
  context!: BrowserContext;
  page!: Page;

  async launch(userDataDir: string) {
    this.context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      viewport: null,
      args: ['--start-maximized'],
    });

    this.context.on('page', async (p) => {
      await p.waitForLoadState('domcontentloaded').catch(() => {});
      this.page = p;
    });

    this.page = this.context.pages()[0] ?? (await this.context.newPage());
  }

  async getState(): Promise<PageState> {
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    return extractPageState(this.page);
  }

  private locator(id: number) {
    return this.page.locator(`[data-agent-id="${id}"]`).first();
  }

  async click(id: number) {
    const loc = this.locator(id);
    await loc.scrollIntoViewIfNeeded();
    await loc.click({ timeout: 8000 });
    await this.page.waitForTimeout(600);
  }

  async type(id: number, text: string, submit = false) {
    const loc = this.locator(id);
    await loc.scrollIntoViewIfNeeded();
    await loc.click({ timeout: 8000 });
    await loc.fill('').catch(() => {});
    await loc.pressSequentially(text, { delay: 15 });
    if (submit) await this.page.keyboard.press('Enter');
    await this.page.waitForTimeout(500);
  }

  async pressKey(key: string) {
    await this.page.keyboard.press(key);
    await this.page.waitForTimeout(300);
  }

  async scroll(direction: 'up' | 'down', amount: 'small' | 'page' = 'page') {
    const magnitude = amount === 'page' ? 800 : 300;
    const delta = direction === 'down' ? magnitude : -magnitude;
    await this.page.mouse.wheel(0, delta);
    await this.page.waitForTimeout(500);
  }

  async navigate(url: string) {
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  }

  async goBack() {
    await this.page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
  }

  async extractText(id: number): Promise<string> {
    const loc = this.locator(id);
    const text = await loc.innerText().catch(() => '');
    return text.slice(0, 4000);
  }

  async close() {
    await this.context.close();
  }
}
