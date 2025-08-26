export const TITLE_INPUT_PRIMARY = 'textarea[placeholder="Title"]';
export const BODY_EDITOR_PRIMARY = 'div[contenteditable="true"]';
export const PUBLISH_BUTTON_PRIMARY = 'button:has-text("Publish")';


export const TITLE_INPUT_FALLBACKS = [
  'textarea[aria-label="Title"]',
  '[data-testid="post-title"] textarea',
];

export const BODY_EDITOR_FALLBACKS = [
  '[data-testid="post-editor"] [contenteditable="true"]',
  '[role="textbox"][contenteditable="true"]',
];

export const PUBLISH_BUTTON_FALLBACKS = [
  '[data-testid="publish-button"]',
  'role=button[name=/^(Publish|Post)$/i]',
];


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
