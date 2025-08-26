export const TITLE_INPUT = 'textarea[placeholder="Title"]';
// TODO: Fallbacks could include data-testid or aria-label if placeholder changes

export const BODY_EDITOR = 'div[contenteditable="true"]';
// TODO: Consider more specific selector or data-testid since editor markup may evolve

export const PUBLISH_BUTTON = 'button:has-text("Publish")';
// TODO: Fallback to data-testid or match innerText variations (e.g., "Post" or localized text)
