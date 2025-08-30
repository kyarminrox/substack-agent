import type { PlatformDriver } from './platformDriver.js';
import type { PostDraftInput, NoteInput, Comment, Stats, StatsRange } from '../types/schemas.js';
import { env, flags } from '../infra/config.js';
import { openContext, newPage, saveAuthState, humanPause } from '../infra/playwright.js';
import { retry } from '../infra/retry.js';
import { logJson } from '../infra/logger.js';
import { appendRun } from '../infra/runs.js';
import { getLastRun } from '../infra/runs.js';
import {
  TITLE_INPUT,
  TITLE_INPUT_FALLBACKS,
  BODY_EDITOR,
  BODY_EDITOR_FALLBACKS,
} from '../infra/selectors/substack.js';
import { PUBLISH_SCROLL_CANDIDATES, PUBLISH_FOOTER_ANCHOR, FINAL_PUBLISH_BTN_XPATH } from '../infra/selectors/substack.js';
import {
  CONTINUE_BUTTON, CONTINUE_BUTTON_FALLBACKS,
  SEND_EMAIL_CHECKBOX, SEND_EMAIL_CHECKBOX_FALLBACKS,
  TITLE_TESTING_TOGGLE, TITLE_TESTING_TOGGLE_FALLBACKS,
  SCHEDULE_SECTION,
  SCHEDULE_TOGGLE,
  SCHEDULE_DT,
  SCHEDULE_DATE,
  SCHEDULE_TIME,
  SCHEDULE_CAL_BTN,
  waitForFirstVisible,
} from '../infra/selectors/substack.js';
import { CREATE_NEW_BUTTON, CREATE_POST_MENU_ITEM } from '../infra/selectors/substack.js';
import fs from 'node:fs';
import path from 'node:path';

async function ensureCheckbox(
  page: import('playwright').Page,
  selector: string,
  desired: boolean,
): Promise<void> {
  const el = await page.$(selector);
  if (!el) return;
  const checked = await el.isChecked().catch(() => false);
  if (checked !== desired) {
    await el.click({ force: true });
  }
}

async function safeClick(
  page: import('playwright').Page,
  target: string | import('playwright').Locator,
  opts: { timeoutMs?: number; label?: string } = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const label = opts.label ?? 'click';
  const loc = typeof target === 'string' ? page.locator(target) : target;

  await loc.scrollIntoViewIfNeeded().catch(() => {});
  try {
    await loc.click({ trial: true, timeout: Math.min(3000, timeoutMs) });
    await loc.click({ timeout: Math.min(4000, timeoutMs) });
    return;
  } catch {}

  try {
    await page.waitForTimeout(150);
    await loc.evaluate((el: Element) => (el as HTMLElement).click());
    return;
  } catch {}

  await loc.click({ force: true, timeout: timeoutMs });
}

function norm(s: string) { return (s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

function byRoleBtn(page: import('playwright').Page, name: RegExp) {
  return page.getByRole('button', { name });
}
function byRoleChk(page: import('playwright').Page, name: RegExp) {
  return page.getByRole('checkbox', { name });
}

const AUTH_PATH = path.join(env.SUBSTACK_AUTH_DIR, 'substack.json');

async function ensurePublishBarVisible(page: import('playwright').Page): Promise<void> {
  // Reset zoom to 100% to avoid sticky footer being off-screen
  await page.evaluate(() => { (document.body as any).style.zoom = '1'; });
  // Give Substack a tall viewport to ensure the footer can mount
  try { await page.setViewportSize({ width: 1440, height: 1000 }); } catch {}
  // Nudge layout so sticky observers fire
  await page.evaluate(() => window.dispatchEvent(new Event('resize'))).catch(() => {});
  // Scroll progressively to the bottom, pausing to let lazy UIs mount
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(300);
    // If the button exists and is visible, we’re done (no :has-text usage)
    const barLocator = page
      .getByRole('button', { name: /^(Publish now|Send to everyone now|Send to everyone in|Publish in)/i })
      .or(page.locator('[data-testid="publish-button"]'))
      .first();
    const hasBar = await barLocator.isVisible().catch(() => false);
    if (hasBar) return;
  }
  // Final attempt: jump to end and wiggle
  await page.keyboard.press('End').catch(() => {});
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollBy(0, -200)).catch(() => {});
  await page.waitForTimeout(200);
}

export type PublishPostInput = {
  id?: string;              // legacy optional
  postId?: string;          // e.g. "172159950"
  editUrl?: string;         // e.g. "https://yourpub.substack.com/publish/post/172159950"
  scheduleAt?: string | Date;
  sendEmail?: boolean;      // default false (web-only publish)
  title?: string;           // optional for archive fallback matching
};

function extractPostId(editUrlOrId?: string): string | undefined {
  if (!editUrlOrId) return undefined;
  const m = editUrlOrId.match(/\/publish\/post\/(\d+)/);
  if (m) return m[1];
  if (/^\d+$/.test(editUrlOrId)) return editUrlOrId;
  return undefined;
}

export class SubstackDriver implements PlatformDriver {
  readonly name = 'substack';

  async ensureAuth(): Promise<void> {
    if (!fs.existsSync(AUTH_PATH)) {
      throw new Error(
        `No Substack auth found at ${path.resolve(AUTH_PATH)}. Run: npm run auth:substack`,
      );
    }
  }

  async updateLastDraftHtml(input: { html: string; title?: string; force?: boolean }): Promise<{ editUrl: string }> {
    await this.ensureAuth();
    const { browser, context } = await openContext();
    try {
      const page = await newPage(context);
      const last = getLastRun('substack-drafts');
      if (!last?.editUrl) {
        throw new Error('No previous draft found to update. Create a draft first.');
      }
      const target = last.editUrl;
      await retry(() => page.goto(target), { attempts: 3, delayMs: 500 });

      // Ensure editor exists
      await page.waitForSelector('body', { state: 'visible', timeout: 10_000 });
      const titleSel = await retry(
        () => waitForFirstVisible(page, [TITLE_INPUT, ...TITLE_INPUT_FALLBACKS]),
        { attempts: 3, delayMs: 400 },
      );
      const bodySel = await retry(
        () => waitForFirstVisible(page, [BODY_EDITOR, ...BODY_EDITOR_FALLBACKS]),
        { attempts: 3, delayMs: 400 },
      );

      // Multi-session block: visible banner or persistent "Saving..." before input
      try {
        const hint = page.locator('text=/another window|open elsewhere|unsaved changes/i').first();
        const hintVisible = await hint.isVisible({ timeout: 500 }).catch(() => false);
        let persistentSaving = false;
        try {
          const saving = page.locator('text=/Saving/i').first();
          const seen = await saving.isVisible({ timeout: 500 }).catch(() => false);
          if (seen) {
            await page.waitForTimeout(3000);
            persistentSaving = await saving.isVisible().catch(() => false);
          }
        } catch {}
        if ((hintVisible || persistentSaving) && !input.force) {
          logJson('substack', 'warn', { ev: 'multi_session_block' });
          throw new Error('Possible multi-session editor open. Close other tabs or pass --force-inplace.');
        }
      } catch {}

      // Screenshot before paste
      try { await page.screenshot({ path: `playwright/.runs/update-pre-${Date.now()}.png`, fullPage: false }); } catch {}

      // Clear body
      await page.click(bodySel);
      const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
      await page.keyboard.down(mod);
      await page.keyboard.press('KeyA');
      await page.keyboard.up(mod);
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(150);
      await page.evaluate((sel: string) => {
        const el = document.querySelector(sel);
        if (el) el.textContent = '';
      }, bodySel).catch(() => {});
      await page.waitForFunction((sel: string) => {
        const el = document.querySelector(sel);
        return !!el && !(el.textContent && el.textContent.trim().length > 0);
      }, bodySel).catch(() => {});

      // Paste new HTML (with fallbacks)
      const doPaste = async () => {
        let inserted = false;
        try {
          await page.evaluate(async (html: string) => {
            const plain = html.replace(/<[^>]+>/g, ' ');
            const item = new ClipboardItem({
              'text/html': new Blob([html], { type: 'text/html' }),
              'text/plain': new Blob([plain], { type: 'text/plain' }),
            });
            await navigator.clipboard.write([item]);
          }, input.html);
          await page.keyboard.down(mod);
          await page.keyboard.press('KeyV');
          await page.keyboard.up(mod);
          inserted = true;
        } catch {}
        if (!inserted) {
          try {
            await page.evaluate(({ html, sel }: { html: string; sel: string }) => {
              const root = document.querySelector(sel) as HTMLElement | null;
              if (!root) throw new Error('editor not found');
              const range = document.createRange();
              range.selectNodeContents(root);
              range.collapse(true);
              const seln = window.getSelection();
              seln?.removeAllRanges();
              seln?.addRange(range);
              document.execCommand('insertHTML', false, html);
            }, { html: input.html, sel: bodySel });
            inserted = true;
          } catch {}
        }
        if (!inserted) {
          await page.type(bodySel, input.html.replace(/<[^>]+>/g, ' '));
        }
      };

      const nudgeAndSave = async () => {
        // Emit input event
        await page.keyboard.type(' ');
        await page.keyboard.press('Backspace');
        // Blur editor by focusing title, then the page body
        await page.click(titleSel, { delay: 50 });
        await page.click('body', { delay: 50 });
        // Wait for autosave UI OR network quiet
        try {
          await page.waitForSelector('text=/Saved/i', { timeout: 7000 });
        } catch {
          await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
        }
        logJson('substack', 'info', { ev: 'draft_saved' });
      };

      const pasteCycle = async () => {
        await doPaste();
        await nudgeAndSave();
      };

      // Compose sentinel-appended HTML
      const sentinel = new Date().toISOString();
      const htmlWithSentinel = `${input.html}\n<p><span data-ss-sentinel="${sentinel}"></span></p>`;
      // Swap input.html temporarily during paste cycles
      const originalHtml = input.html;
      (input as any).html = htmlWithSentinel;
      await pasteCycle();

      // (Title will be handled after body verification)

      // Screenshot after paste + saved
      try { await page.screenshot({ path: `playwright/.runs/update-post-${Date.now()}.png`, fullPage: false }); } catch {}

      // Reload verification cycle (require non-empty content; sentinel best-effort)
      const verifyAfterReload = async (): Promise<number> => {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector(bodySel, { state: 'visible', timeout: 8000 });
        const len = await page.evaluate((sel: string) => (document.querySelector(sel)?.textContent ?? '').trim().length, bodySel).catch(() => 0);
        return Number(len) || 0;
      };

      let length = await verifyAfterReload();
      const hasSentinel = async () => !!(await page.$('[data-ss-sentinel]'));
      let sentPresent = await hasSentinel();
      const MIN_LEN = 1;
      if (length < MIN_LEN) {
        // Retry one full cycle: clear → paste → save → reload
        await page.click(bodySel);
        await page.keyboard.down(mod);
        await page.keyboard.press('KeyA');
        await page.keyboard.up(mod);
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(120);
        await pasteCycle();
        if (input.title) await nudgeAndSave();
        length = await verifyAfterReload();
        sentPresent = await hasSentinel();
      }
      if (length < MIN_LEN) {
        try { await page.screenshot({ path: `playwright/.runs/update-reload-fail-${Date.now()}.png`, fullPage: false }); } catch {}
        throw new Error('In-place update did not persist after reload.');
      }
      if (!sentPresent) {
        logJson('substack', 'warn', { ev: 'sentinel_missing_same_tab' });
      }
      logJson('substack', 'info', { ev: 'draft_verified_same_tab', length, sentinel: sentPresent });

      // Screenshot after reload verification
      try { await page.screenshot({ path: `playwright/.runs/update-reload-${Date.now()+1}.png`, fullPage: false }); } catch {}
      try { await page.screenshot({ path: `playwright/.runs/update-verified-${Date.now()}.png`, fullPage: false }); } catch {}

      // Title Update block (guarded)
      if (input.title) {
        if (flags.safeMode) {
          logJson('substack', 'info', { ev: 'draft_title_skip_safe_mode' });
        } else {
          // Re-resolve selector after reloads
          const titleSel2 = await retry(
            () => waitForFirstVisible(page, [TITLE_INPUT, ...TITLE_INPUT_FALLBACKS]),
            { attempts: 3, delayMs: 400 },
          );

          const before = await page.inputValue(titleSel2).catch(() => '');
          if (norm(before) !== norm(input.title)) {
            const ts = Date.now();
            try { await page.screenshot({ path: `playwright/.runs/title-pre-${ts}.png`, fullPage: false }); } catch {}

            const modKey = process.platform === 'darwin' ? 'Meta' : 'Control';
            await page.focus(titleSel2);
            await page.keyboard.down(modKey);
            await page.keyboard.press('KeyA');
            await page.keyboard.up(modKey);
            await page.keyboard.press('Backspace');

            try {
              await page.fill(titleSel2, input.title);
            } catch {
              await page.type(titleSel2, input.title);
            }

            // Save nudge: space/backspace and blur/focus
            await page.keyboard.type(' ');
            await page.keyboard.press('Backspace');
            await page.click(bodySel, { delay: 50 }).catch(() => {});
            await page.click(titleSel2, { delay: 50 }).catch(() => {});
            try {
              await page.waitForSelector('text=/Saved/i', { timeout: 7000 });
            } catch {
              await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
            }
            logJson('substack', 'info', { ev: 'draft_title_saved' });
            try { await page.screenshot({ path: `playwright/.runs/title-post-${Date.now()}.png`, fullPage: false }); } catch {}

            // Same-tab verify
            await page.reload({ waitUntil: 'domcontentloaded' });
            const vSel = await retry(
              () => waitForFirstVisible(page, [TITLE_INPUT, ...TITLE_INPUT_FALLBACKS]),
              { attempts: 3, delayMs: 400 },
            );
            const after1 = await page.inputValue(vSel).catch(() => '');
            logJson('substack', 'info', { ev: 'draft_title_verify_same_tab', value: after1 });
            if (norm(after1) !== norm(input.title)) {
              // One retry: clear → fill → save → reload → recheck
              await page.focus(vSel);
              await page.keyboard.down(modKey);
              await page.keyboard.press('KeyA');
              await page.keyboard.up(modKey);
              await page.keyboard.press('Backspace');
              try { await page.fill(vSel, input.title); } catch { await page.type(vSel, input.title); }
              await page.keyboard.type(' ');
              await page.keyboard.press('Backspace');
              await page.click(bodySel, { delay: 50 }).catch(() => {});
              await page.click(vSel, { delay: 50 }).catch(() => {});
              try { await page.waitForSelector('text=/Saved/i', { timeout: 7000 }); } catch { await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {}); }
              await page.reload({ waitUntil: 'domcontentloaded' });
              const vSel2 = await retry(() => waitForFirstVisible(page, [TITLE_INPUT, ...TITLE_INPUT_FALLBACKS]), { attempts: 3, delayMs: 400 });
              const after2 = await page.inputValue(vSel2).catch(() => '');
              logJson('substack', 'info', { ev: 'draft_title_verify_same_tab', value: after2 });
              if (norm(after2) !== norm(input.title)) {
                throw new Error('Title did not persist after reload');
              }
            }
            logJson('substack', 'info', { ev: 'draft_title_verified_same_tab' });
            try { await page.screenshot({ path: `playwright/.runs/title-verified-${Date.now()}.png`, fullPage: false }); } catch {}
          }
        }
      }

      const editUrl = page.url();
      let chars = await page.evaluate((sel: string) => (document.querySelector(sel)?.textContent ?? '').trim().length, bodySel).catch(() => 0);
      logJson('substack', 'info', { ev: 'draft_updated', editUrl, chars });
      await saveAuthState(context);

      // Fresh-context verification to defeat dueling autosaves
      const freshCheck = async (label: 'fresh' | 'fresh-retry'): Promise<number> => {
        const fresh = await openContext();
        try {
          const p2 = await newPage(fresh.context);
          await retry(() => p2.goto(editUrl), { attempts: 3, delayMs: 500 });
          await p2.waitForSelector('body', { state: 'visible', timeout: 10_000 });
          const bodySel2 = await retry(
            () => waitForFirstVisible(p2, [BODY_EDITOR, ...BODY_EDITOR_FALLBACKS]),
            { attempts: 3, delayMs: 400 },
          );
          // Optional multi-session hint
          try {
            const hint = p2.locator('text=/another window|unsaved changes/i').first();
            if (await hint.isVisible({ timeout: 500 }).catch(() => false)) {
              logJson('substack', 'warn', { ev: 'multi_session_hint' });
            }
          } catch {}
          const len = await p2.evaluate((sel: string) => (document.querySelector(sel)?.textContent ?? '').trim().length, bodySel2).catch(() => 0);
          const snap = label === 'fresh' ? 'update-fresh' : 'update-fresh-retry';
          try { await p2.screenshot({ path: `playwright/.runs/${snap}-${Date.now()}.png`, fullPage: false }); } catch {}
          return Number(len) || 0;
        } finally {
          try { await fresh.context.close(); } catch {}
          try { await fresh.browser.close(); } catch {}
        }
      };

      // Fresh-context verification of sentinel + length
      // Close current page to simulate a new session load
      try { await page.close(); } catch {}
      const fresh = await openContext();
      let freshLen = 0;
      try {
        const p2 = await newPage(fresh.context);
        await retry(() => p2.goto(editUrl), { attempts: 3, delayMs: 500 });
        await p2.waitForSelector('body', { state: 'visible', timeout: 10_000 });
        const bodySel2 = await retry(() => waitForFirstVisible(p2, [BODY_EDITOR, ...BODY_EDITOR_FALLBACKS]), { attempts: 3, delayMs: 400 });
        const hasSent2 = !!(await p2.$('[data-ss-sentinel]'));
        freshLen = await p2.evaluate((sel: string) => (document.querySelector(sel)?.textContent ?? '').trim().length, bodySel2).catch(() => 0) as number;
        try { await p2.screenshot({ path: `playwright/.runs/update-fresh-${Date.now()}.png`, fullPage: false }); } catch {}
        // Fresh-context title verification and one repair pass if needed
        if (input.title && !flags.safeMode) {
          try {
            const tSel2 = await retry(() => waitForFirstVisible(p2, [TITLE_INPUT, ...TITLE_INPUT_FALLBACKS]), { attempts: 3, delayMs: 400 });
            let freshTitle = await p2.inputValue(tSel2).catch(() => '');
            logJson('substack', 'info', { ev: 'draft_title_verify_fresh', value: freshTitle });
            try { await p2.screenshot({ path: `playwright/.runs/title-fresh-${Date.now()}.png`, fullPage: false }); } catch {}
            if (norm(freshTitle) !== norm(input.title)) {
              // Repair in original context
              const tSelMain = await retry(() => waitForFirstVisible(page, [TITLE_INPUT, ...TITLE_INPUT_FALLBACKS]), { attempts: 3, delayMs: 400 });
              const modKey = process.platform === 'darwin' ? 'Meta' : 'Control';
              await page.focus(tSelMain);
              await page.keyboard.down(modKey); await page.keyboard.press('KeyA'); await page.keyboard.up(modKey);
              await page.keyboard.press('Backspace');
              try { await page.fill(tSelMain, input.title); } catch { await page.type(tSelMain, input.title); }
              await page.keyboard.type(' ');
              await page.keyboard.press('Backspace');
              await page.click(bodySel, { delay: 50 }).catch(() => {});
              await page.click(tSelMain, { delay: 50 }).catch(() => {});
              try { await page.waitForSelector('text=/Saved/i', { timeout: 7000 }); } catch { await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {}); }

              // Re-check in a new fresh context
              const fresh2 = await openContext();
              try {
                const p4 = await newPage(fresh2.context);
                await retry(() => p4.goto(editUrl), { attempts: 3, delayMs: 500 });
                await p4.waitForSelector('body', { state: 'visible', timeout: 10_000 });
                const tSel4 = await retry(() => waitForFirstVisible(p4, [TITLE_INPUT, ...TITLE_INPUT_FALLBACKS]), { attempts: 3, delayMs: 400 });
                freshTitle = await p4.inputValue(tSel4).catch(() => '');
                logJson('substack', 'info', { ev: 'draft_title_verify_fresh', value: freshTitle });
                try { await p4.screenshot({ path: `playwright/.runs/title-fresh-${Date.now()}.png`, fullPage: false }); } catch {}
                if (norm(freshTitle) !== norm(input.title)) {
                  throw new Error('Title did not persist in fresh context');
                }
              } finally {
                try { await fresh2.context.close(); } catch {}
                try { await fresh2.browser.close(); } catch {}
              }
            }
            logJson('substack', 'info', { ev: 'draft_title_verified_fresh' });
          } catch {}
        }
        const MIN_LEN = 1;
        if (freshLen < MIN_LEN) {
          logJson('substack', 'warn', { ev: 'verify_fresh_failed' });
          // Redo once in original context
          const rp = await newPage(context);
          await retry(() => rp.goto(editUrl), { attempts: 3, delayMs: 500 });
          await rp.waitForSelector('body', { state: 'visible', timeout: 10_000 });
          const tSel = await retry(() => waitForFirstVisible(rp, [TITLE_INPUT, ...TITLE_INPUT_FALLBACKS]), { attempts: 3, delayMs: 400 });
          const bSel = await retry(() => waitForFirstVisible(rp, [BODY_EDITOR, ...BODY_EDITOR_FALLBACKS]), { attempts: 3, delayMs: 400 });
          const modX = process.platform === 'darwin' ? 'Meta' : 'Control';
          await rp.click(bSel);
          await rp.keyboard.down(modX); await rp.keyboard.press('KeyA'); await rp.keyboard.up(modX);
          await rp.keyboard.press('Backspace');
          await rp.waitForTimeout(120);
          // Re-paste sentinel HTML
          let insertedX = false;
          try {
            await rp.evaluate(async (html: string) => {
              const plain = html.replace(/<[^>]+>/g, ' ');
              const item = new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([plain], { type: 'text/plain' }) });
              await navigator.clipboard.write([item]);
            }, htmlWithSentinel);
            await rp.keyboard.down(modX); await rp.keyboard.press('KeyV'); await rp.keyboard.up(modX);
            insertedX = true;
          } catch {}
          if (!insertedX) {
            try {
              await rp.evaluate(({ html, sel }: { html: string; sel: string }) => {
                const root = document.querySelector(sel) as HTMLElement | null;
                if (!root) throw new Error('editor not found');
                const range = document.createRange();
                range.selectNodeContents(root);
                range.collapse(true);
                const seln = window.getSelection();
                seln?.removeAllRanges();
                seln?.addRange(range);
                document.execCommand('insertHTML', false, html);
              }, { html: htmlWithSentinel, sel: bSel });
              insertedX = true;
            } catch {}
          }
          if (!insertedX) {
            await rp.type(bSel, htmlWithSentinel.replace(/<[^>]+>/g, ' '));
          }
          await rp.keyboard.type(' ');
          await rp.keyboard.press('Backspace');
          await rp.click(tSel, { delay: 50 });
          await rp.click('body', { delay: 50 });
          try { await rp.locator('text=/Saved/i').first().waitFor({ timeout: 7000 }); } catch { await rp.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {}); }
          try { await rp.close(); } catch {}

          // Re-verify fresh
          const p3 = await newPage(fresh.context);
          await retry(() => p3.goto(editUrl), { attempts: 3, delayMs: 500 });
          await p3.waitForSelector('body', { state: 'visible', timeout: 10_000 });
          const bodySel3 = await retry(() => waitForFirstVisible(p3, [BODY_EDITOR, ...BODY_EDITOR_FALLBACKS]), { attempts: 3, delayMs: 400 });
          const hasSent3 = !!(await p3.$('[data-ss-sentinel]'));
          freshLen = await p3.evaluate((sel: string) => (document.querySelector(sel)?.textContent ?? '').trim().length, bodySel3).catch(() => 0) as number;
          try { await p3.screenshot({ path: `playwright/.runs/update-fresh-retry-${Date.now()}.png`, fullPage: false }); } catch {}
          if (freshLen < MIN_LEN) {
            logJson('substack', 'warn', { ev: 'verify_fresh_failed' });
            throw new Error('In-place update did not persist in a fresh context.');
          }
        }
        logJson('substack', 'info', { ev: 'verify_fresh_ok', length: freshLen });

        // Remove sentinel in fresh context and save (only if present)
        const hadSent = !!(await p2.$('[data-ss-sentinel]'));
        if (hadSent) {
          await p2.evaluate(() => { document.querySelectorAll('[data-ss-sentinel]').forEach(n => n.remove()); });
          // Save nudge
          const t2 = await retry(() => waitForFirstVisible(p2, [TITLE_INPUT, ...TITLE_INPUT_FALLBACKS]), { attempts: 3, delayMs: 400 });
          await p2.click(t2, { delay: 50 });
          await p2.click('body', { delay: 50 });
          await p2.keyboard.type(' ');
          await p2.keyboard.press('Backspace');
          try { await p2.locator('text=/Saved/i').first().waitFor({ timeout: 7000 }); } catch { await p2.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {}); }
          // Reload and verify sentinel removed
          await p2.reload({ waitUntil: 'domcontentloaded' });
          await retry(() => waitForFirstVisible(p2, [BODY_EDITOR, ...BODY_EDITOR_FALLBACKS]), { attempts: 3, delayMs: 400 });
          const sentGone = !(await p2.$('[data-ss-sentinel]'));
          const finalLen = await p2.evaluate((sel: string) => (document.querySelector(sel)?.textContent ?? '').trim().length, bodySel2).catch(() => 0) as number;
          if (!sentGone || finalLen < MIN_LEN) {
            throw new Error('Sentinel removal failed or content too short after final reload.');
          }
          logJson('substack', 'info', { ev: 'sentinel_removed' });
          logJson('substack', 'info', { ev: 'draft_updated_final', editUrl, chars: finalLen });
          if (input.title) {
            logJson('substack', 'info', { ev: 'draft_update_final_with_title', editUrl, title: input.title });
          }
        } else {
          logJson('substack', 'info', { ev: 'sentinel_not_present_skip' });
          const finalLen = freshLen;
          logJson('substack', 'info', { ev: 'draft_updated_final', editUrl, chars: finalLen, sentinelPresent: false });
          if (input.title) {
            logJson('substack', 'info', { ev: 'draft_update_final_with_title', editUrl, title: input.title });
          }
        }
      } finally {
        try { await fresh.context.close(); } catch {}
        try { await fresh.browser.close(); } catch {}
      }
      // Restore original html (safety)
      (input as any).html = originalHtml;
      return { editUrl };
    } finally {
      await context.close();
      await browser.close();
    }
  }

  async createDraft(input: PostDraftInput): Promise<{ id: string; editUrl?: string }> {

    await this.ensureAuth();

    const { browser, context } = await openContext();
    try {
      const page = await newPage(context);
      const composeUrl = env.SUBSTACK_PUBLICATION_URL
        ? `${env.SUBSTACK_PUBLICATION_URL}/publish/post`
        : `${env.SUBSTACK_BASE_URL}/publish/post`;
      await retry(() => page.goto(composeUrl), { attempts: 3, delayMs: 500 });
      await page.waitForLoadState('domcontentloaded');
      await page.waitForSelector('body', { state: 'visible', timeout: 10_000 });
      logJson('substack', 'info', { ev: 'compose_opened', url: composeUrl });

      // (A) dismiss the “dashboard got a refresh!” modal if present
      try {
        const gotIt = await page.$('role=button[name=/^(Got it|Close)$/i]');
        if (gotIt) await gotIt.click();
        else {
          const closeX = await page.$('button[aria-label="Close"]');
          if (closeX) await closeX.click();
        }
      } catch { /* ignore */ }
      if (page.url().includes('/publish/home')) {
        const createBtn = await page.$(CREATE_NEW_BUTTON);
        if (createBtn) {
          await createBtn.click().catch(() => {});
          await page.waitForSelector(CREATE_POST_MENU_ITEM, { timeout: 3000 }).catch(() => {});
          const postItem = await page.$(CREATE_POST_MENU_ITEM);
          if (postItem) await postItem.click().catch(() => {});
        }
      }
      try {
        await page.waitForLoadState('networkidle');
      } catch {
        // ignore quick timeout
      }
      const titleSel = await retry(
        () => waitForFirstVisible(page, [TITLE_INPUT, ...TITLE_INPUT_FALLBACKS]),
        { attempts: 3, delayMs: 400 },
      );
      const bodySel = await retry(
        () => waitForFirstVisible(page, [BODY_EDITOR, ...BODY_EDITOR_FALLBACKS]),
        { attempts: 3, delayMs: 400 },
      );
      console.log('Navigated to composer:', composeUrl);
      await humanPause();
      logJson('substack', 'info', { ev: 'title_fill', safeSkip: flags.safeMode, selector: titleSel });
      console.log(`Typing title into: ${titleSel}`);
      if (flags.safeMode) {
        console.log('SAFE_MODE – skipping title fill');
      } else {
        await page.click(titleSel);
        await page.fill(titleSel, input.title);
      }
      logJson('substack', 'info', { ev: 'body_insert', safeSkip: flags.safeMode, selector: bodySel });
      console.log(`Inserting body HTML into: ${bodySel}`);
      if (flags.safeMode) {
        console.log('SAFE_MODE – skipping body HTML insertion');
        console.log('SAFE_MODE – skipping editor verification');
      } else {
        await page.click(bodySel);
        let inserted = false;
        try {
          await page.evaluate(async (html: string) => {
            const plain = html.replace(/<[^>]+>/g, ' ');
            const item = new ClipboardItem({
              'text/html': new Blob([html], { type: 'text/html' }),
              'text/plain': new Blob([plain], { type: 'text/plain' }),
            });
            await navigator.clipboard.write([item]);
          }, input.html);

          const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
          await page.keyboard.down(mod);
          await page.keyboard.press('KeyV');
          await page.keyboard.up(mod);
          inserted = true;
        } catch (e) {
          console.warn('Clipboard HTML paste failed, will try execCommand/typing:', e);
        }

        if (!inserted) {
          try {
            await page.evaluate(({ html, sel }: { html: string; sel: string }) => {
              const root = document.querySelector(sel) as HTMLElement | null;
              if (!root) throw new Error('editor not found');
              const range = document.createRange();
              range.selectNodeContents(root);
              range.collapse(true);
              const seln = window.getSelection();
              seln?.removeAllRanges();
              seln?.addRange(range);
              document.execCommand('insertHTML', false, html);
            }, { html: input.html, sel: bodySel });
            inserted = true;
          } catch {}
        }

        if (!inserted) {
          await page.type(bodySel, input.html.replace(/<[^>]+>/g, ' '));
        }

        // Nudge to guarantee an input event even after paste/insert
        await page.keyboard.type(' ');
        await page.keyboard.press('Backspace');

        // Blur editor by focusing title, then the page body
        await page.click(titleSel, { delay: 50 });
        await page.click('body', { delay: 50 });

        // Wait for autosave UI OR network quiet
        try {
          await page.waitForSelector('text=/Saved/i', { timeout: 5000 });
        } catch {
          await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
        }

        // Strong verification: content present in the model
        await page.evaluate((sel: string) => { (window as any).__SS_BODY_SEL = sel; }, bodySel);
        await page.waitForFunction(() => {
          const sel = (window as any).__SS_BODY_SEL as string | undefined;
          if (!sel) return false;
          const el = document.querySelector(sel);
          return !!el && !!el.textContent && el.textContent.trim().length > 0;
        }, { timeout: 7000 });
        console.log('Editor content verified');
      }
      if (input.tags?.length) {
        console.log('TODO: apply tags', input.tags);
      }
      const id = `draft_${Date.now()}`;
      const editUrl = page.url();
      // (Optional) Smoke-check persistence in-session
      try {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector(bodySel, { state: 'visible' });
        const ok = await page.evaluate((sel: string) => !!document.querySelector(sel)?.textContent?.trim(), bodySel);
        console.log('Post reload content present:', ok);
      } catch {}
      console.log('Draft created', id, editUrl);
      await humanPause();
      await saveAuthState(context);
      console.log('Saved Substack auth state to:', path.resolve(AUTH_PATH));
      appendRun('substack-drafts', { id, editUrl, title: input.title ?? '', source: 'createDraft' });
      logJson('substack', 'info', { ev: 'draft_created', id, editUrl, title: input.title ?? '' });

      return { id, editUrl };
    } finally {
      await context.close();
      await browser.close();
    }
  }

  async publishPost(input: PublishPostInput): Promise<{ publicUrl: string }> {
    await this.ensureAuth();
    if (!env.SUBSTACK_PUBLICATION_URL) {
      throw new Error('SUBSTACK_PUBLICATION_URL not configured');
    }

    const postId = extractPostId(input.postId ?? input.editUrl);
    if (!postId) throw new Error('publishPost: require postId or editUrl containing /publish/post/{id}');

    const { browser, context } = await openContext();
    try {
      const page = await newPage(context);
      const editUrl = `${env.SUBSTACK_PUBLICATION_URL}/publish/post/${postId}`;

      await retry(() => page.goto(editUrl), { attempts: 3, delayMs: 500 });
      logJson('substack', 'info', { ev: 'publish_open', editUrl });

      // Ensure editor exists
      await page.waitForSelector('body', { state: 'visible', timeout: 10_000 });
      await retry(() => waitForFirstVisible(page, [BODY_EDITOR, ...BODY_EDITOR_FALLBACKS]), { attempts: 3 });

      // Continue → Publish screen (click once if present)
      try {
        const continueSel = await retry(
          () => waitForFirstVisible(page, [CONTINUE_BUTTON, ...CONTINUE_BUTTON_FALLBACKS]),
          { attempts: 2, delayMs: 300 },
        );
        if (!flags.safeMode) await page.click(continueSel);
        await page.getByRole('heading', { name: /Publish/i }).waitFor({ timeout: 5000 }).catch(() => {});
      } catch {
        // If the publish panel is already open, continue button may not be present
      }

      // Delivery: default to web-only (avoid accidental email)
      const sendEmailSel = await retry(
        () => waitForFirstVisible(page, [SEND_EMAIL_CHECKBOX, ...SEND_EMAIL_CHECKBOX_FALLBACKS]),
        { attempts: 2, delayMs: 300 },
      ).catch(() => undefined);
      if (sendEmailSel) {
        const cb = page.locator(sendEmailSel);
        await cb.scrollIntoViewIfNeeded().catch(() => {});
        logJson('substack', 'info', { ev: 'delivery_set', sendEmail: !!input.sendEmail });
        if (!flags.safeMode) await ensureCheckbox(page, sendEmailSel, !!input.sendEmail);
      }

      // Title testing → OFF
      const titleTestSel = await retry(
        () => waitForFirstVisible(page, [TITLE_TESTING_TOGGLE, ...TITLE_TESTING_TOGGLE_FALLBACKS]),
        { attempts: 2, delayMs: 300 },
      ).catch(() => undefined);
      if (titleTestSel && !flags.safeMode) await ensureCheckbox(page, titleTestSel, false);

      // Optional schedule: enable and fill time inputs. Afterwards, the bottom-right button text reflects scheduling.
      let scheduled = false;
      let btnText = '';
      let publishSel = '';
      if (input.scheduleAt) {
        const at = typeof input.scheduleAt === 'string' ? new Date(input.scheduleAt) : input.scheduleAt;
        if (isNaN(at.getTime())) throw new Error('scheduleAt is not a valid date');

        const yyyy = String(at.getFullYear()).padStart(4, '0');
        const mm   = String(at.getMonth() + 1).padStart(2, '0');
        const dd   = String(at.getDate()).padStart(2, '0');
        const HH   = String(at.getHours()).padStart(2, '0');
        const MM   = String(at.getMinutes()).padStart(2, '0');

        // Optionally scroll the schedule section into view
        const schedSection = await page.$(SCHEDULE_SECTION).catch(() => null);
        if (schedSection) await schedSection.scrollIntoViewIfNeeded().catch(() => {});

        // Enable schedule
        const scheduleToggleSel = await retry(
          () => waitForFirstVisible(page, [SCHEDULE_TOGGLE]),
          { attempts: 3, delayMs: 400 },
        );
        if (!flags.safeMode) await ensureCheckbox(page, scheduleToggleSel, true);

        // Try to fill inputs in this order
        const attemptFill = async (): Promise<boolean> => {
          const dt = await page.locator(SCHEDULE_DT).first();
          const hasDt = await dt.isVisible().catch(() => false);
          const hasDate = !!(await page.$(SCHEDULE_DATE));
          const hasTime = !!(await page.$(SCHEDULE_TIME));
          logJson('substack', 'info', { ev: 'schedule_inputs_present', present: { dt: hasDt, date: hasDate, time: hasTime } });
          if (flags.safeMode) return hasDt || hasDate || hasTime;
          try {
            if (hasDt) {
              await page.fill(SCHEDULE_DT, `${yyyy}-${mm}-${dd}T${HH}:${MM}`);
              logJson('substack', 'info', { ev: 'schedule_fill', when: at.toISOString() });
              return true;
            }
            let filled = false;
            const dateEl = await page.$(SCHEDULE_DATE);
            if (dateEl) { await dateEl.fill(`${yyyy}-${mm}-${dd}`); filled = true; }
            const timeEl = await page.$(SCHEDULE_TIME);
            if (timeEl) { await timeEl.fill(`${HH}:${MM}`); filled = true; }
            if (filled) {
              logJson('substack', 'info', { ev: 'schedule_fill', when: at.toISOString() });
            }
            return filled;
          } catch {
            return false;
          }
        };

        let ok = await attemptFill();
        if (!ok) {
          // try to reveal inputs via calendar button
          try { await safeClick(page, SCHEDULE_CAL_BTN, { label: 'open_calendar' }); } catch {}
          ok = await attemptFill();
        }

        // After filling, wait for the bottom-right button to reflect scheduling
        const publishCandidates = [
          'button:has-text("Publish in")',
          'button:has-text("Send to everyone in")',
          '[data-testid="publish-button"]',
          'button:has-text("Publish now")',
        ];
        publishSel = await retry(() => waitForFirstVisible(page, publishCandidates), { attempts: 5, delayMs: 400 });
        btnText = await page.locator(publishSel).innerText().catch(() => '');
        scheduled = true;
      }

      // Pre-click debug before final publish action
      try { await page.screenshot({ path: `playwright/.runs/pre-publish-${Date.now()}.png`, fullPage: false }); } catch {}

      // Find publish button if not derived from scheduling block
      if (!publishSel) {
        const publishCandidates = [
          'button:has-text("Publish in")',
          'button:has-text("Send to everyone in")',
          '[data-testid="publish-button"]',
          'button:has-text("Publish now")',
        ];
        publishSel = await retry(() => waitForFirstVisible(page, publishCandidates), { attempts: 5, delayMs: 400 });
        btnText = await page.locator(publishSel).innerText().catch(() => '');
      }

      // Click deterministically
      if (!flags.safeMode) {
        await safeClick(page, publishSel, { label: 'publish_primary' });
      }

        // --- Web-only publish nudge modal (second step) ---
        try {
          // The nudge appears only for web-only. We detect it by its buttons.
          const webOnlyBtn = byRoleBtn(page, /Publish on web only/i);
          const alsoEmailBtn = byRoleBtn(page, /Also send via email/i);

          // Wait a short time for either of the nudge buttons to appear.
          await Promise.race([
            webOnlyBtn.waitFor({ state: 'visible', timeout: 2000 }),
            alsoEmailBtn.waitFor({ state: 'visible', timeout: 2000 }),
          ]);

          // If it's there, optionally tick "Don't ask again" to avoid future prompts.
          const dontAsk = byRoleChk(page, /don.?t ask again/i);
          try {
            await dontAsk.check({ force: true, trial: true });
            await dontAsk.check({ force: true });
          } catch {}

          // Choose web-only to match sendEmail=false.
          await safeClick(page, webOnlyBtn, { label: 'web_only_confirm' });
          logJson('substack', 'info', { ev: 'web_only_nudge', action: 'publish_on_web_only' });
        } catch {
          // No nudge shown; continue.
        }

        const targetTitle = (await page.title().catch(() => input.postId || '')) || '';
        const wanted = norm(input?.editUrl ? input.editUrl.split('/publish/post/')[0] || '' : '');

        // Race: popup OR same-tab /p/ URL OR “View post” control
        const popupPromise = context.waitForEvent('page', { timeout: 15000 }).catch(() => null);
        const urlPromise   = page.waitForURL('**/p/**', { timeout: 15000 }).then(() => page).catch(() => null);
        const viewBtn      = page.locator('a:has-text("View post"), button:has-text("View post")');
        const viewPromise  = viewBtn.first().waitFor({ timeout: 12000 }).then(async () => {
          await safeClick(page, viewBtn.first(), { label: 'open_view_post' });
          return context.waitForEvent('page', { timeout: 10000 }).catch(() => null);
        }).catch(() => null);

      const winner = (await Promise.race([popupPromise, urlPromise, viewPromise])) as import('playwright').Page | null;
      let publicUrl = '';
      try {
        const p = winner || page;
        await p.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
        publicUrl = p.url();
      } catch {}

      // Extra DOM fallback: sometimes the editor injects a permalink element after publish.
      if (publicUrl.includes('/publish/post/')) {
        try {
          const linkDom = await page.locator('a[href*="/p/"]').first();
          await linkDom.waitFor({ state: 'visible', timeout: 2000 });
          const href = await linkDom.getAttribute('href');
          if (href) publicUrl = href;
        } catch {}
      }

      // If scheduled and we land on publish home (no immediate permalink), treat as scheduled success
      if (scheduled && !/\/p\//.test(publicUrl)) {
        const urlAfter = page.url();
        if (/\/publish\/home/.test(urlAfter) || /\/publish\//.test(urlAfter)) {
          logJson('substack', 'info', { ev: 'scheduled', when: (input.scheduleAt instanceof Date ? input.scheduleAt.toISOString() : new Date(input.scheduleAt as any).toISOString()), btnText });
          appendRun('substack-scheduled', { postId, when: (input.scheduleAt instanceof Date ? input.scheduleAt.toISOString() : new Date(input.scheduleAt as any).toISOString()), editUrl, btnText });
          try { await page.screenshot({ path: `playwright/.runs/post-publish-${Date.now()+1}.png`, fullPage: false }); } catch {}
          await saveAuthState(context);
          return { publicUrl: editUrl };
        }
      }

      // If we still don't have a /p/ permalink, try a strict archive match by title
      if (!/\/p\//.test(publicUrl)) {
        // Navigate to archive and search for exact title
        const archiveUrl = `${env.SUBSTACK_PUBLICATION_URL}/archive`;
        await page.goto(archiveUrl, { waitUntil: 'domcontentloaded' });
        const cards = page.locator('a[href*="/p/"]');
        const n = await cards.count();
        let found = '';
        for (let i = 0; i < n; i++) {
          const a = cards.nth(i);
          const t = norm(await a.textContent().catch(() => '') || '');
          const wantTitle = norm(input?.title || '');
          if (t && wantTitle && t === wantTitle) {
            found = await a.getAttribute('href') || '';
            break;
          }
        }
        if (found) {
          publicUrl = found.startsWith('http') ? found : `${env.SUBSTACK_BASE_URL}${found}`;
        } else {
          // No positive match — fail loudly (we keep screenshots)
          try { await page.screenshot({ path: `playwright/.runs/post-publish-${Date.now()}.png`, fullPage: false }); } catch {}
          throw new Error('Published click completed, but permalink could not be verified by /p/ navigation or archive title match.');
        }
      }

      // Post-click debug
      try { await page.screenshot({ path: `playwright/.runs/post-publish-${Date.now()+1}.png`, fullPage: false }); } catch {}

      logJson('substack', 'info', { ev: 'published', publicUrl, btnText });
      appendRun('substack-published', { postId, publicUrl, title: input.title || '' });
      await saveAuthState(context);
      return { publicUrl };
    } finally {
      await context.close();
      await browser.close();
    }
  }

  async createNote(_input: NoteInput): Promise<{ url?: string }> {
    // TODO: implement via Playwright Notes composer
    throw new Error('Not implemented: SubstackDriver.createNote');
  }

  async listComments(_params: { since?: string }): Promise<Comment[]> {
    // TODO: implement by scraping post comments thread
    throw new Error('Not implemented: SubstackDriver.listComments');
  }

  async replyToComment(_input: { commentId: string; text: string }): Promise<void> {
    // TODO: implement by posting via UI automation
    throw new Error('Not implemented: SubstackDriver.replyToComment');
  }

  async getStats(_params: { range: StatsRange }): Promise<Stats> {
    // TODO: implement if feasible, else return placeholder
    throw new Error('Not implemented: SubstackDriver.getStats');
  }
}

