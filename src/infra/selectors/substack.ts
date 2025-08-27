export const TITLE_INPUT_PRIMARY = 'textarea[placeholder="Title"]';
export const BODY_EDITOR_PRIMARY = 'div[contenteditable="true"]';
export const PUBLISH_BUTTON_PRIMARY = 'button:has-text("Publish")';


export const TITLE_INPUT_FALLBACKS = [
  'div[contenteditable="true"][data-placeholder="Title"]',
  'h1[contenteditable="true"]',
  '[data-testid="post-title"] textarea',
  'textarea[aria-label="Title"]',
];

export const BODY_EDITOR_FALLBACKS = [
  'div[contenteditable="true"][data-placeholder*="Start writing"]',
  'div.ProseMirror[contenteditable="true"]',
  '[data-lexical-editor] [contenteditable="true"]',
  '[role="textbox"][contenteditable="true"]',
];

export const PUBLISH_BUTTON_FALLBACKS = [
  '[data-testid="publish-button"]',
  'role=button[name=/^(Publish|Post)$/i]',
];


export const DISMISS_MODAL_CANDIDATES = [
  'button:has-text("Got it")',
  'button:has-text("Got It")',
  'button[aria-label="Close"]',
  '[data-testid="modal-close"]',
  'role=button[name=/^(Got it|Close)$/i]',
];

// Optional dashboard fallback to reach the composer
export const CREATE_NEW_BUTTON = 'button:has-text("Create new")';
export const CREATE_POST_MENU_ITEM = 'a:has-text("Post"), button:has-text("Post")';


// Existing exports retained for backwards compatibility
export const TITLE_INPUT = TITLE_INPUT_PRIMARY;
export const BODY_EDITOR = BODY_EDITOR_PRIMARY;
export const PUBLISH_BUTTON = PUBLISH_BUTTON_PRIMARY;

// Utility to find the first visible selector from a list
import type { Page } from 'playwright';

export async function waitForFirstVisible(
  page: Page,
  selectors: string[],
  timeout = 30_000,
): Promise<string> {
  const start = Date.now();
  for (const sel of selectors) {
    const elapsed = Date.now() - start;
    if (elapsed > timeout) break;
    try {
      await page.waitForSelector(sel, {
        state: 'visible',
        timeout: Math.min(2000, timeout - elapsed),
      });
      return sel;
    } catch {
      // try next selector
    }
  }
  throw new Error(
    `None of the selectors became visible within ${timeout}ms: ${selectors.join(', ')}`,
  );
}
