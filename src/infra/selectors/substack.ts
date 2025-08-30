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

// Publish flow
export const CONTINUE_BUTTON_PRIMARY = 'button:has-text("Continue")';
export const CONTINUE_BUTTON_FALLBACKS = [
  'role=button[name=/Continue/i]',
  '[data-testid="continue-button"]',
];

export const PUBLISH_NOW_PRIMARY = 'button:has-text("Publish now")';
export const PUBLISH_NOW_FALLBACKS = [
  'role=button[name=/^(Publish now|Send|Post)$/i]',
  '[data-testid="publish-button"]',
  'button:has-text("Publish in")',
  'button:has-text("Send to everyone in")',
];

// Delivery: "Send via email and the Substack app"
export const SEND_EMAIL_CHECKBOX_PRIMARY = 'label:has-text("Send via email and the Substack app") input[type="checkbox"]';
export const SEND_EMAIL_CHECKBOX_FALLBACKS = [
  'input[type="checkbox"][name="sendEmail"]',
  'role=checkbox[name=/Send via email/i]',
];

// Title testing toggle (we want this OFF)
export const TITLE_TESTING_TOGGLE_PRIMARY = 'label:has-text("Title testing") input[type="checkbox"]';
export const TITLE_TESTING_TOGGLE_FALLBACKS = [
  'role=switch[name=/Title testing/i]',
  '[data-testid="title-test-toggle"] input[type="checkbox"]',
];

// Scheduling controls
// Scheduling controls (no explicit confirm button on current UI)
export const SCHEDULE_SECTION = 'section:has-text("Schedule time to publish"), div:has-text("Schedule time to publish")';
export const SCHEDULE_TOGGLE  = 'input[type="checkbox"]:near(:text("Schedule time to publish"))';
export const SCHEDULE_DT      = 'input[type="datetime-local"]';
export const SCHEDULE_DATE    = 'input[type="date"]';
export const SCHEDULE_TIME    = 'input[type="time"]';
// Calendar button fallback (optional)
export const SCHEDULE_CAL_BTN = 'button:has([data-icon="calendar"]), button[aria-label*="calendar"], button:has-text("Schedule")';

// Back-compat aliases (optional)
export const CONTINUE_BUTTON = CONTINUE_BUTTON_PRIMARY;
export const PUBLISH_NOW = PUBLISH_NOW_PRIMARY;
export const SEND_EMAIL_CHECKBOX = SEND_EMAIL_CHECKBOX_PRIMARY;
export const TITLE_TESTING_TOGGLE = TITLE_TESTING_TOGGLE_PRIMARY;
// SCHEDULE_TOGGLE now points to near() based selector above

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

// Footer publish area anchors
// Broaden the scrollable container guess: any auto/scroll panes on the page
export const PUBLISH_SCROLL_CANDIDATES = [
  '.pc-overflow-auto',
  '[class*="overflow-auto"]',
  '[class*="scroll"]',
  '[style*="overflow"]',
].join(', ');
export const PUBLISH_FOOTER_ANCHOR = 'input[data-track-input="publish_button_text"]';
// Button immediately before the anchor (Cancel is 2nd before; Publish is 1st)
export const FINAL_PUBLISH_BTN_XPATH = 'xpath=preceding-sibling::button[1]';

// Save state badges
export const SAVED_BADGE = 'text=/Saved/i';
export const SAVING_BADGE = 'text=/Saving/i';
